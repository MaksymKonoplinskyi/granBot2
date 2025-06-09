import { Telegraf, Context, Markup, Scenes, session } from 'telegraf';
import { Command } from '../commands/command.interface';
import { MessageSubscriber } from './subscribers/message.subscriber';
import { DataSource } from 'typeorm';
import { Event } from '../entities/Event';
import { ADMINS } from '../config';
import { WizardContext } from 'telegraf/typings/scenes';
import { MoreThan, LessThan } from 'typeorm';

// Настройки логирования
interface LoggingConfig {
  verbose: boolean;
}

// Вспомогательная функция для парсинга даты в формате DD.MM.YYYY, HH:mm
function parseDateTime(dateTimeStr: string): Date | null {
  const parts = dateTimeStr.match(/^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2})$/);
  if (!parts) {
    return null;
  }
  const [_, day, month, year, hours, minutes] = parts.map(Number);
  // Месяцы в JS Date начинаются с 0, поэтому month - 1
  const date = new Date(year, month - 1, day, hours, minutes, 0); // Секунды устанавливаем в 0
  return date;
}

function formatDate(date: Date | null): string {
  if (!date) return 'Не указана';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы в JS Date начинаются с 0
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  // Убираем секунды
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

function isAdmin(userId: number | string | undefined): boolean {
  if (!userId) return false;
  return ADMINS.includes(String(userId));
}

function isEventComplete(event: Event): boolean {
  return !!(
    event.title &&
    event.description &&
    event.startDate &&
    event.endDate
  );
}

export class TelegramBot {
  private readonly bot: Telegraf<Scenes.WizardContext>;
  private isInitialized = false;
  private stage: Scenes.Stage<Scenes.WizardContext>;
  private readonly dataSource: DataSource;
  private readonly loggingConfig: LoggingConfig;

  constructor(private readonly token: string, dataSource: DataSource, loggingConfig: LoggingConfig = { verbose: false }) {
    this.dataSource = dataSource;
    this.loggingConfig = loggingConfig;
    this.bot = new Telegraf<Scenes.WizardContext>(this.token);
    this.setupErrorHandling();

    // --- WizardScene для создания встречи ---
    const createEventWizard = new Scenes.WizardScene(
      'create-event-wizard',
      async (ctx: any) => {
        if (!isAdmin(ctx.from?.id)) {
          await ctx.reply('У вас нет прав администратора.');
          return ctx.scene.leave();
        }
        ctx.scene.session.event = {};
        await ctx.reply('Этап 1/4: Введите название встречи:');
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        try {
          ctx.scene.session.event.title = ctx.message.text;
          // Сохраняем черновик в базу
          const event = new Event();
          event.title = ctx.scene.session.event.title;
          console.log('Создаём новую встречу:', event);
          await this.dataSource.manager.save(event);
          console.log('Встреча сохранена, id:', event.id);
          ctx.scene.session.event.id = event.id;
          await ctx.reply(`Название: ${event.title}\n\nЭтап 2/4: Введите дату начала (ДД.ММ.ГГГГ, ЧЧ:ММ):`);
          return ctx.wizard.next();
        } catch (error) {
          console.error('Ошибка при создании встречи:', error);
          await ctx.reply('Произошла ошибка при создании встречи. Попробуйте позже.');
          return ctx.scene.leave();
        }
      },
      async (ctx: any) => {
        try {
          const event = await this.dataSource.manager.findOneBy(Event, { id: ctx.scene.session.event.id });
          if (!event) {
            console.error('Встреча не найдена, id:', ctx.scene.session.event.id);
            await ctx.reply('Ошибка: встреча не найдена.');
            return ctx.scene.leave();
          }
          const parsedDate = parseDateTime(ctx.message.text);
          if (!parsedDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ:');
            return; // Остаемся на этом шаге
          }
          event.startDate = parsedDate;
          await this.dataSource.manager.save(event);
          ctx.scene.session.event.startDate = event.startDate;
          await ctx.reply(`Название: ${event.title}\nДата начала: ${formatDate(event.startDate)}\n\nЭтап 3/4: Введите дату окончания (ДД.ММ.ГГГГ, ЧЧ:ММ):`);
          return ctx.wizard.next();
        } catch (error) {
          console.error('Ошибка при сохранении даты начала:', error);
          await ctx.reply('Произошла ошибка при сохранении даты. Попробуйте позже.');
          return ctx.scene.leave();
        }
      },
      async (ctx: any) => {
        const event = await this.dataSource.manager.findOneBy(Event, { id: ctx.scene.session.event.id });
        if (!event) {
          await ctx.reply('Ошибка: встреча не найдена.');
          return ctx.scene.leave();
        }
        const parsedDate = parseDateTime(ctx.message.text);
        if (!parsedDate) {
          await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ');
          return; // Остаемся на этом шаге
        }
        event.endDate = parsedDate;
        await this.dataSource.manager.save(event);
        ctx.scene.session.event.endDate = event.endDate;
        await ctx.reply(`Название: ${event.title}\nДата начала: ${formatDate(event.startDate)}\nДата окончания: ${formatDate(event.endDate)}\n\nЭтап 4/4: Введите описание встречи:`);
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        const event = await this.dataSource.manager.findOneBy(Event, { id: ctx.scene.session.event.id });
        if (!event) {
          await ctx.reply('Ошибка: встреча не найдена.');
          return ctx.scene.leave();
        }
        event.description = ctx.message.text;
        await this.dataSource.manager.save(event);
        
        const buttons = [
          [Markup.button.callback('Опубликовать', `publish_event_${event.id}`), 
           Markup.button.callback('Редактировать', `edit_event_${event.id}`)]
        ];
        
        await ctx.reply(
          `Встреча создана!\n\nНазвание: ${event.title}\nДата начала: ${formatDate(event.startDate)}\nДата окончания: ${formatDate(event.endDate)}\nОписание: ${event.description}\n\nСтатус: ${event.isPublished ? 'Опубликована' : 'Черновик'}`,
          Markup.inlineKeyboard(buttons)
        );
        return ctx.scene.leave();
      }
    );

    // Сцена редактирования встречи
    const editEventWizard = new Scenes.WizardScene(
      'edit-event-wizard',
      async (ctx: any) => {
        if (!isAdmin(ctx.from?.id)) {
          await ctx.reply('У вас нет прав администратора.');
          return ctx.scene.leave();
        }
        const eventId = ctx.scene.state.eventId;
        const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });
        
        if (!event) {
          await ctx.reply('Встреча не найдена.');
          return ctx.scene.leave();
        }

        const buttons = [
          [Markup.button.callback('✏️ Название', 'edit_title')],
          [Markup.button.callback('✏️ Дата начала', 'edit_start_date')],
          [Markup.button.callback('✏️ Дата окончания', 'edit_end_date')],
          [Markup.button.callback('✏️ Описание', 'edit_description')],
          [Markup.button.callback(event.isPublished ? '📝 Сделать черновиком' : '✅ Опубликовать', 'toggle_publish')],
          [Markup.button.callback(event.isCancelled ? '✅ Восстановить встречу' : '❌ Отменить встречу', 'toggle_cancel')],
          [Markup.button.callback('🗑 Удалить встречу', 'delete_event')],
          [Markup.button.callback('📋 Встречи', 'admin_events'), 
           Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ];

        await ctx.reply(
          `Редактирование встречи:\n\n` +
          `Название: ${event.title}\n` +
          `Дата начала: ${formatDate(event.startDate)}\n` +
          `Дата окончания: ${formatDate(event.endDate)}\n` +
          `Описание: ${event.description}\n` +
          `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
          `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
          `Выберите поле для редактирования:`,
          Markup.inlineKeyboard(buttons)
        );
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        if (!ctx.callbackQuery) {
          return;
        }

        const action = ctx.callbackQuery.data;
        const eventId = ctx.scene.state.eventId;
        const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });

        if (!event) {
          await ctx.reply('Встреча не найдена.');
          return ctx.scene.leave();
        }

        switch (action) {
          case 'edit_title':
            ctx.scene.state.editingField = 'title';
            await ctx.reply(
              `Текущее название: ${event.title}\nВведите новое название:`,
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]])
            );
            break;
          case 'edit_start_date':
            ctx.scene.state.editingField = 'startDate';
            await ctx.reply(
              `Текущая дата начала: ${formatDate(event.startDate)}\nВведите новую дату в формате ДД.ММ.ГГГГ, ЧЧ:ММ:`,
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]])
            );
            break;
          case 'edit_end_date':
            ctx.scene.state.editingField = 'endDate';
            await ctx.reply(
              `Текущая дата окончания: ${formatDate(event.endDate)}\nВведите новую дату в формате ДД.ММ.ГГГГ, ЧЧ:ММ:`,
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]])
            );
            break;
          case 'edit_description':
            ctx.scene.state.editingField = 'description';
            await ctx.reply(
              `Текущее описание: ${event.description}\nВведите новое описание:`,
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]])
            );
            break;
          case 'toggle_publish':
            if (!isEventComplete(event)) {
              await ctx.answerCbQuery('Не все поля заполнены. Заполните все обязательные поля перед публикацией.');
              return;
            }
            event.isPublished = !event.isPublished;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery(event.isPublished ? 'Встреча опубликована!' : 'Встреча сделана черновиком');
            
            // Обновляем сообщение с новой информацией
            const buttons = [
              [Markup.button.callback('✏️ Название', 'edit_title')],
              [Markup.button.callback('✏️ Дата начала', 'edit_start_date')],
              [Markup.button.callback('✏️ Дата окончания', 'edit_end_date')],
              [Markup.button.callback('✏️ Описание', 'edit_description')],
              [Markup.button.callback(event.isPublished ? '📝 Сделать черновиком' : '✅ Опубликовать', 'toggle_publish')],
              [Markup.button.callback(event.isCancelled ? '✅ Восстановить встречу' : '❌ Отменить встречу', 'toggle_cancel')],
              [Markup.button.callback('🗑 Удалить встречу', 'delete_event')],
              [Markup.button.callback('📋 Встречи', 'admin_events'), 
               Markup.button.callback('🏠 Главное меню', 'main_menu')]
            ];

            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(buttons)
            );
            return;
          case 'toggle_cancel':
            event.isCancelled = !event.isCancelled;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery(event.isCancelled ? 'Встреча отменена!' : 'Встреча восстановлена');
            
            // Обновляем сообщение с новой информацией
            const buttons2 = [
              [Markup.button.callback('✏️ Название', 'edit_title')],
              [Markup.button.callback('✏️ Дата начала', 'edit_start_date')],
              [Markup.button.callback('✏️ Дата окончания', 'edit_end_date')],
              [Markup.button.callback('✏️ Описание', 'edit_description')],
              [Markup.button.callback(event.isPublished ? '📝 Сделать черновиком' : '✅ Опубликовать', 'toggle_publish')],
              [Markup.button.callback(event.isCancelled ? '✅ Восстановить встречу' : '❌ Отменить встречу', 'toggle_cancel')],
              [Markup.button.callback('🗑 Удалить встречу', 'delete_event')],
              [Markup.button.callback('📋 Встречи', 'admin_events'), 
               Markup.button.callback('🏠 Главное меню', 'main_menu')]
            ];

            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(buttons2)
            );
            return;
          case 'delete_event':
            ctx.scene.state.deleting = true;
            await ctx.reply(
              '⚠️ ВНИМАНИЕ: Это действие необратимо!\n' +
              'Для подтверждения удаления встречи введите пинкод:',
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить удаление', 'cancel_delete')]])
            );
            return ctx.wizard.next();
          case 'cancel_delete':
            ctx.scene.state.deleting = false;
            await ctx.reply('✅ Удаление отменено.');
            return ctx.wizard.back();
          case 'cancel_edit':
            await ctx.reply('Редактирование отменено.');
            return ctx.wizard.back();
          case 'main_menu':
            await ctx.scene.leave();
            await ctx.scene.enter('main-menu');
            return;
          case 'admin_events':
            await ctx.scene.leave();
            await ctx.editMessageText(
              'Выберите тип встреч:',
              Markup.inlineKeyboard([
                [Markup.button.callback('Ближайшие', 'admin_upcoming_events')],
                [Markup.button.callback('Прошедшие', 'admin_past_events')],
                [Markup.button.callback('Все', 'admin_all_events')],
                [Markup.button.callback('◀️ Назад', 'admin')]
              ])
            );
            return;
        }
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        // Если это ввод пинкода для удаления
        if (ctx.scene.state.deleting) {
          const pin = ctx.message.text;
          if (pin === '7777') {
            const eventId = ctx.scene.state.eventId;
            const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });
            if (event) {
              await this.dataSource.manager.remove(event);
              await ctx.reply('✅ Встреча успешно удалена.');
              await ctx.scene.leave();
              await ctx.scene.enter('main-menu');
            } else {
              await ctx.reply('❌ Встреча не найдена.');
              return ctx.scene.leave();
            }
          } else {
            await ctx.reply('❌ Неверный пинкод. Попробуйте еще раз или отмените удаление.');
            return;
          }
          return;
        }

        // Обработка редактирования полей
        const eventId = ctx.scene.state.eventId;
        const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });
        const field = ctx.scene.state.editingField;
        const newValue = ctx.message.text;

        if (!event) {
          await ctx.reply('Встреча не найдена.');
          return ctx.scene.leave();
        }

        try {
          switch (field) {
            case 'title':
              event.title = newValue;
              break;
            case 'startDate':
              const parsedStartDate = parseDateTime(newValue);
              if (!parsedStartDate) {
                await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ:');
                return;
              }
              event.startDate = parsedStartDate;
              break;
            case 'endDate':
              const parsedEndDate = parseDateTime(newValue);
              if (!parsedEndDate) {
                await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ:');
                return;
              }
              event.endDate = parsedEndDate;
              break;
            case 'description':
              event.description = newValue;
              break;
          }

          await this.dataSource.manager.save(event);
          await ctx.reply('Поле успешно обновлено!');
          
          // Показываем обновленную информацию о встрече
          const buttons = [
            [Markup.button.callback('✏️ Название', 'edit_title')],
            [Markup.button.callback('✏️ Дата начала', 'edit_start_date')],
            [Markup.button.callback('✏️ Дата окончания', 'edit_end_date')],
            [Markup.button.callback('✏️ Описание', 'edit_description')],
            [Markup.button.callback(event.isPublished ? '📝 Сделать черновиком' : '✅ Опубликовать', 'toggle_publish')],
            [Markup.button.callback(event.isCancelled ? '✅ Восстановить встречу' : '❌ Отменить встречу', 'toggle_cancel')],
            [Markup.button.callback('🗑 Удалить встречу', 'delete_event')],
            [Markup.button.callback('📋 Встречи', 'admin_events'), 
             Markup.button.callback('🏠 Главное меню', 'main_menu')]
          ];

          await ctx.reply(
            `Обновленная информация о встрече:\n\n` +
            `Название: ${event.title}\n` +
            `Дата начала: ${formatDate(event.startDate)}\n` +
            `Дата окончания: ${formatDate(event.endDate)}\n` +
            `Описание: ${event.description}\n` +
            `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
            `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
            `Выберите поле для редактирования:`,
            Markup.inlineKeyboard(buttons)
          );
          return ctx.wizard.back();
        } catch (error) {
          console.error('Ошибка при обновлении поля:', error);
          await ctx.reply('Произошла ошибка при обновлении поля. Попробуйте еще раз.');
          return ctx.wizard.back();
        }
      }
    );

    // Сцена главного меню
    const mainMenuScene = new Scenes.BaseScene<Scenes.WizardContext>('main-menu');
    mainMenuScene.enter(async (ctx) => {
      const buttons = [
        [Markup.button.callback('Ближайшие встречи', 'new_events'), Markup.button.callback('Мои встречи', 'my_events')],
        [Markup.button.callback('Отзывы', 'reviews'), Markup.button.callback('О клубе', 'info')],
        [Markup.button.callback('Помощь', 'help')]
      ];
      if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback('Админка', 'admin')]);
      }
      await ctx.reply(
        'Главное меню:',
        Markup.inlineKeyboard(buttons)
      );
    });

    this.stage = new Scenes.Stage<Scenes.WizardContext>([createEventWizard, editEventWizard, mainMenuScene]);
    
    this.bot.use(session());
    this.bot.use(this.stage.middleware());

    // Добавляем обработчик для кнопки публикации
    this.bot.action(/^publish_event_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });
      
      if (!event) {
        await ctx.answerCbQuery('Встреча не найдена');
        return;
      }

      if (!isEventComplete(event)) {
        await ctx.answerCbQuery('Не все поля заполнены. Заполните все обязательные поля перед публикацией.');
        return;
      }

      event.isPublished = true;
      await this.dataSource.manager.save(event);
      
      await ctx.answerCbQuery('Встреча успешно опубликована!');
      await ctx.editMessageText(
        `Встреча опубликована!\n\nНазвание: ${event.title}\nДата начала: ${formatDate(event.startDate)}\nДата окончания: ${formatDate(event.endDate)}\nОписание: ${event.description}\n\nСтатус: Опубликована`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Редактировать', `edit_event_${event.id}`)]
        ])
      );
    });

    // Добавляем обработчик для кнопки редактирования
    this.bot.action(/^edit_event_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      await ctx.answerCbQuery();
      // @ts-ignore
      ctx.scene.enter('edit-event-wizard', { eventId });
    });

    this.bot.action('admin', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Админ-меню:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Создать встречу', 'create_event'), Markup.button.callback('Встречи', 'admin_events')],
          [Markup.button.callback('Главное меню', 'main_menu'), Markup.button.callback('Назад', 'main_menu')]
        ])
      );
    });

    // Добавляем обработчик для кнопки "Встречи"
    this.bot.action('admin_events', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Выберите тип встреч:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Ближайшие', 'admin_upcoming_events')],
          [Markup.button.callback('Прошедшие', 'admin_past_events')],
          [Markup.button.callback('Все', 'admin_all_events')],
          [Markup.button.callback('◀️ Назад', 'admin')]
        ])
      );
    });

    // Обработчики для разных типов встреч
    this.bot.action('admin_upcoming_events', async (ctx) => {
      await ctx.answerCbQuery();
      const now = new Date();
      const events = await this.dataSource.manager.find(Event, {
        where: {
          startDate: MoreThan(now)
        },
        order: {
          startDate: 'ASC'
        }
      });
      await this.sendEventsList(ctx, events, 'Ближайшие встречи');
    });

    this.bot.action('admin_past_events', async (ctx) => {
      await ctx.answerCbQuery();
      const now = new Date();
      const events = await this.dataSource.manager.find(Event, {
        where: {
          startDate: LessThan(now)
        },
        order: {
          startDate: 'DESC'
        }
      });
      await this.sendEventsList(ctx, events, 'Прошедшие встречи');
    });

    this.bot.action('admin_all_events', async (ctx) => {
      await ctx.answerCbQuery();
      const events = await this.dataSource.manager.find(Event, {
        order: {
          startDate: 'DESC'
        }
      });
      await this.sendEventsList(ctx, events, 'Все встречи');
    });

    // Добавляем обработчик для кнопки "Главное меню"
    this.bot.action('main_menu', async (ctx) => {
      await ctx.answerCbQuery();
      const buttons = [
        [Markup.button.callback('Ближайшие встречи', 'new_events'), Markup.button.callback('Мои встречи', 'my_events')],
        [Markup.button.callback('Отзывы', 'reviews'), Markup.button.callback('О клубе', 'info')],
        [Markup.button.callback('Помощь', 'help')]
      ];
      if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback('Админка', 'admin')]);
      }
      await ctx.editMessageText(
        'Главное меню:',
        Markup.inlineKeyboard(buttons)
      );
    });
  }

  private async sendEventsList(ctx: any, events: Event[], title: string) {
    if (events.length === 0) {
      await ctx.editMessageText(
        `${title}:\n\nСписок пуст`,
        Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'admin_events')]])
      );
      return;
    }

    const messageText = events.map(event => {
      return `📅 ${event.title}\n` +
             `Дата начала: ${formatDate(event.startDate)}\n` +
             `Дата окончания: ${formatDate(event.endDate)}\n` +
             `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
             `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n` +
             `ID: ${event.id}\n`;
    }).join('\n');

    const buttons = events.map(event => [
      Markup.button.callback(`✏️ Редактировать "${event.title}"`, `edit_event_${event.id}`)
    ]);

    // Добавляем кнопку "Назад"
    buttons.push([Markup.button.callback('◀️ Назад', 'admin_events')]);

    await ctx.editMessageText(
      `${title}:\n\n${messageText}`,
      Markup.inlineKeyboard(buttons)
    );
  }

  public getWebhookCallback(path: string) {
    return this.bot.webhookCallback(path);
  }
  
  public async setWebhook(url: string) {
    await this.bot.telegram.setWebhook(url);
  }

  private setupErrorHandling(): void {
    this.bot.catch((err: any, ctx: Context) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      ctx.reply('Произошла ошибка при обработке запроса').catch(console.error);
    });
  }

  private log(message: string, data?: any): void {
    if (this.loggingConfig.verbose) {
      if (data) {
        console.log(`[BOT] ${message}`, data);
      } else {
        console.log(`[BOT] ${message}`);
      }
    }
  }

  public async launchWebhook(webhookUrl: string, port: number = 3000): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot not initialized. Call init() first');
    }

    try {
      await this.bot.telegram.setWebhook(webhookUrl);
      await this.bot.launch({
        webhook: {
          domain: webhookUrl,
          port: port
        }
      });
      this.log(`Bot started in webhook mode on ${webhookUrl}`);
    } catch (error) {
      console.error('Webhook launch failed:', error);
      throw error;
    }
  }

  public async launchPolling(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot not initialized. Call init() first');
    }

    try {
      await this.bot.launch();
      this.log('Bot started in polling mode');
    } catch (error) {
      console.error('Polling launch failed:', error);
      throw error;
    }
  }

  public init(commands: Command[], subscribers?: MessageSubscriber[]): void {
    if (this.isInitialized) {
      throw new Error('Bot already initialized');
    }

    this.registerCommands(commands);
    this.registerSubscribers(subscribers || []);
    this.isInitialized = true;
    this.log('Bot initialized');
  }

  public stop(reason?: string): void {
    if (reason) {
      console.log(`Stopping bot: ${reason}`);
    }
    this.bot.stop();
  }

  private registerCommands(commands: Command[]): void {
    commands.forEach(command => {
      this.bot.command(command.name, ctx => {
        this.log(`Command executed: ${command.name}`);
        return command.execute(ctx);
      });
    });
  }

  private registerSubscribers(subscribers: MessageSubscriber[]): void {
    subscribers.forEach(subscriber => {
      this.bot.on(subscriber.messageType, ctx => {
        this.log(`Message received: ${subscriber.messageType}`);
        return subscriber.handle(ctx);
      });
    });
  }

  public addStartMenu() {
    this.bot.start((ctx) => {
      const buttons = [
        [Markup.button.callback('Ближайшие встречи', 'new_events'), Markup.button.callback('Мои встречи', 'my_events')],
        [Markup.button.callback('Отзывы', 'reviews'), Markup.button.callback('О клубе', 'info')],
        [Markup.button.callback('Помощь', 'help')]
      ];
      if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback('Админка', 'admin')]);
      }
      return ctx.reply(
        'Главное меню:' +
        '\nтвой ID: ' + ctx.from?.id +
        '\nID админов: ' + ADMINS.join(', '),
        Markup.inlineKeyboard(buttons)
      );
    });

    this.bot.action('info', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Это отличный клуб');
    });

    this.bot.action('admin', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Админ-меню:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Создать встречу', 'create_event'), Markup.button.callback('Встречи', 'admin_events')],
          [Markup.button.callback('Главное меню', 'main_menu'), Markup.button.callback('Назад', 'main_menu')]
        ])
      );
    });
  }

  public addAdminFeatures() {
    this.bot.action('create_event', async (ctx) => {
      await ctx.answerCbQuery();
      if (!isAdmin(ctx.from?.id)) {
        return ctx.reply('У вас нет прав администратора.');
      }
      // Запускаем сцену создания встречи
      // @ts-ignore
      ctx.scene.enter('create-event-wizard');
    });
  }
}