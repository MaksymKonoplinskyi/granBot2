import { Telegraf, Context, Markup, Scenes, session } from 'telegraf';
import { Command } from '../commands/command.interface';
import { MessageSubscriber } from './subscribers/message.subscriber';
import { DataSource } from 'typeorm';
import { Event } from '../entities/Event';
import { ADMINS } from '../config';
import { WizardContext } from 'telegraf/typings/scenes';
import { MoreThan, LessThan } from 'typeorm';
import { EventParticipant, ParticipationStatus } from '../entities/EventParticipant';
import { User } from '../entities/User';
import { PaymentDetails } from '../entities/PaymentDetails';

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

interface PaymentDetailsSceneState {
  title: string;
  detailsId?: number;
  editing?: boolean;
}

interface EventSceneState {
  event: any;
  eventId?: number;
  editingField?: string;
  deleting?: boolean;
}

interface WizardSessionData extends Scenes.WizardSessionData {
  state: PaymentDetailsSceneState | EventSceneState;
}

type BotContext = Scenes.WizardContext<WizardSessionData> & {
  match?: RegExpMatchArray;
};

export class TelegramBot {
  private readonly bot: Telegraf<BotContext>;
  private isInitialized = false;
  private stage: Scenes.Stage<BotContext>;
  private readonly dataSource: DataSource;
  private readonly loggingConfig: LoggingConfig;

  constructor(private readonly token: string, dataSource: DataSource, loggingConfig: LoggingConfig = { verbose: false }) {
    this.dataSource = dataSource;
    this.loggingConfig = loggingConfig;
    this.bot = new Telegraf<BotContext>(this.token);
    this.setupErrorHandling();

    // Устанавливаем меню команд
    this.bot.telegram.setMyCommands([
      { command: 'start', description: '🏠 Главное меню' },
      { command: 'events', description: '📅 Список встреч' },
      { command: 'my_events', description: '👥 Мои встречи' },
      { command: 'help', description: '❓ Помощь' }
    ]);

    // --- WizardScene для создания встречи ---
    const createEventWizard = new Scenes.WizardScene<BotContext>(
      'create-event-wizard',
      async (ctx: BotContext) => {
        if (!isAdmin(ctx.from?.id)) {
          await ctx.reply('У вас нет прав администратора.');
          return ctx.scene.leave();
        }
        const state = ctx.scene.state as EventSceneState;
        state.event = {};
        await ctx.reply('Этап 1/7: Введите название встречи:');
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        try {
          ctx.scene.session.event.title = ctx.message.text;
          await ctx.reply(`Название: ${ctx.scene.session.event.title}\n\nЭтап 2/7: Введите дату начала (ДД.ММ.ГГГГ, ЧЧ:ММ):`);
          return ctx.wizard.next();
        } catch (error) {
          console.error('Ошибка при создании встречи:', error);
          await ctx.reply('Произошла ошибка при создании встречи. Попробуйте позже.');
          return ctx.scene.leave();
        }
      },
      async (ctx: any) => {
        try {
          const parsedDate = parseDateTime(ctx.message.text);
          if (!parsedDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ:');
            return;
          }
          ctx.scene.session.event.startDate = parsedDate;
          await ctx.reply(`Название: ${ctx.scene.session.event.title}\nДата начала: ${formatDate(ctx.scene.session.event.startDate)}\n\nЭтап 3/7: Введите дату окончания (ДД.ММ.ГГГГ, ЧЧ:ММ):`);
          return ctx.wizard.next();
        } catch (error) {
          console.error('Ошибка при сохранении даты начала:', error);
          await ctx.reply('Произошла ошибка при сохранении даты. Попробуйте позже.');
          return ctx.scene.leave();
        }
      },
      async (ctx: any) => {
        const parsedDate = parseDateTime(ctx.message.text);
        if (!parsedDate) {
          await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ');
          return;
        }
        ctx.scene.session.event.endDate = parsedDate;
        await ctx.reply(`Название: ${ctx.scene.session.event.title}\nДата начала: ${formatDate(ctx.scene.session.event.startDate)}\nДата окончания: ${formatDate(ctx.scene.session.event.endDate)}\n\nЭтап 4/7: Введите описание встречи:`);
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        ctx.scene.session.event.description = ctx.message.text;
        await ctx.reply(
          `Название: ${ctx.scene.session.event.title}\n` +
          `Дата начала: ${formatDate(ctx.scene.session.event.startDate)}\n` +
          `Дата окончания: ${formatDate(ctx.scene.session.event.endDate)}\n` +
          `Описание: ${ctx.scene.session.event.description}\n\n` +
          `Этап 5/7: Настройка оплаты\n` +
          `Разрешить оплату на месте?`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Да', 'payment_onsite_yes'), 
             Markup.button.callback('❌ Нет', 'payment_onsite_no')]
          ])
        );
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        if (!ctx.callbackQuery) {
          await ctx.reply('Пожалуйста, используйте кнопки для ответа');
          return;
        }

        const allowOnSite = ctx.callbackQuery.data === 'payment_onsite_yes';
        ctx.scene.session.event.allowOnSitePayment = allowOnSite;
        await ctx.answerCbQuery();
        await ctx.editMessageText(
          `Название: ${ctx.scene.session.event.title}\n` +
          `Дата начала: ${formatDate(ctx.scene.session.event.startDate)}\n` +
          `Дата окончания: ${formatDate(ctx.scene.session.event.endDate)}\n` +
          `Описание: ${ctx.scene.session.event.description}\n` +
          `Оплата на месте: ${allowOnSite ? '✅ Разрешена' : '❌ Запрещена'}\n\n` +
          `Этап 6/8: Введите сумму полной оплаты (только число, без валюты):`
        );
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        const fullPaymentAmount = parseFloat(ctx.message.text);
        if (isNaN(fullPaymentAmount) || fullPaymentAmount < 0) {
          await ctx.reply('Пожалуйста, введите корректную сумму (положительное число):');
          return;
        }
        ctx.scene.session.event.fullPaymentAmount = fullPaymentAmount;
        await ctx.reply(
          `Название: ${ctx.scene.session.event.title}\n` +
          `Дата начала: ${formatDate(ctx.scene.session.event.startDate)}\n` +
          `Дата окончания: ${formatDate(ctx.scene.session.event.endDate)}\n` +
          `Описание: ${ctx.scene.session.event.description}\n` +
          `Оплата при встрече: ${ctx.scene.session.event.allowOnSitePayment ? '✅ Разрешена' : '❌ Запрещена'}\n` +
          `Оплата при встрече: ${ctx.scene.session.event.fullPaymentAmount} грн.\n\n` +
          `Этап 7/8: Введите цену участия при оплате заранее (только число, без валюты, или 0 если оплата заранее не возможна):`
        );
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        try {
          const advancePaymentAmount = parseFloat(ctx.message.text);
          if (isNaN(advancePaymentAmount) || advancePaymentAmount < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число):');
            return;
          }
          
          // Если сумма 0, устанавливаем null
          ctx.scene.session.event.advancePaymentAmount = advancePaymentAmount === 0 ? null : advancePaymentAmount;
          
          if (advancePaymentAmount > 0) {
            await ctx.reply(
              `Название: ${ctx.scene.session.event.title}\n` +
              `Дата начала: ${formatDate(ctx.scene.session.event.startDate)}\n` +
              `Дата окончания: ${formatDate(ctx.scene.session.event.endDate)}\n` +
              `Описание: ${ctx.scene.session.event.description}\n` +
              `Оплата на месте: ${ctx.scene.session.event.allowOnSitePayment ? '✅ Разрешена' : '❌ Запрещена'}\n` +
              `Стоимость при оплате при встрече: ${ctx.scene.session.event.fullPaymentAmount} грн.\n` +
              `Стоимость при оплате заранее: ${ctx.scene.session.event.advancePaymentAmount} грн.\n\n` +
              `Этап 8/8: Введите дату и время крайнего срока оплаты заранее (ДД.ММ.ГГГГ, ЧЧ:ММ):`,
              Markup.inlineKeyboard([
                [Markup.button.callback('⏰ За сутки до начала встречи', 'set_deadline_day_before')]
              ])
            );
            return ctx.wizard.next();
          } else {
            ctx.scene.session.event.advancePaymentDeadline = null;
            // Создаем встречу только после заполнения всех полей
            const event = new Event();
            Object.assign(event, ctx.scene.session.event);
            await this.dataSource.manager.save(event);
            
            const buttons = [
              [Markup.button.callback('Опубликовать', `publish_event_${event.id}`), 
               Markup.button.callback('Редактировать', `edit_event_${event.id}`)]
            ];
            
            await ctx.reply(
              `Встреча создана!\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Оплата на месте: ${event.allowOnSitePayment ? '✅ Разрешена' : '❌ Запрещена'}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}`,
              Markup.inlineKeyboard(buttons)
            );
            return ctx.scene.leave();
          }
        } catch (error) {
          console.error('Ошибка при сохранении встречи:', error);
          await ctx.reply('Произошла ошибка при сохранении встречи. Попробуйте позже.');
          return ctx.scene.leave();
        }
      },
      async (ctx: any) => {
        try {
          let deadline: Date | null = null;

          if (ctx.callbackQuery && ctx.callbackQuery.data === 'set_deadline_day_before') {
            // Устанавливаем дедлайн за сутки до начала встречи
            deadline = new Date(ctx.scene.session.event.startDate);
            deadline.setDate(deadline.getDate() - 1);
            await ctx.answerCbQuery();
          } else {
            // Парсим введенную дату
            deadline = parseDateTime(ctx.message.text);
            if (!deadline) {
              await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ:');
              return;
            }
          }

          ctx.scene.session.event.advancePaymentDeadline = deadline;

          // Создаем встречу только после заполнения всех полей
          const event = new Event();
          Object.assign(event, ctx.scene.session.event);
          await this.dataSource.manager.save(event);
          
          const buttons = [
            [Markup.button.callback('Опубликовать', `publish_event_${event.id}`), 
             Markup.button.callback('Редактировать', `edit_event_${event.id}`)]
          ];
          
          await ctx.reply(
            `Встреча создана!\n\n` +
            `Название: ${event.title}\n` +
            `Дата начала: ${formatDate(event.startDate)}\n` +
            `Дата окончания: ${formatDate(event.endDate)}\n` +
            `Описание: ${event.description}\n` +
            `Оплата при встрече: ${event.allowOnSitePayment ? '✅ Разрешена' : '❌ Запрещена'}\n` +
            `Оплата при встрече: ${event.fullPaymentAmount} грн.\n` +
            `Стоимость при оплате заранее: ${event.advancePaymentAmount} грн.\n` +
            `Крайний срок оплати заранее: ${formatDate(event.advancePaymentDeadline)}\n` +
            `Стоимость и варианты оплаты:\n` +
            `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
            `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
            `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}`,
            Markup.inlineKeyboard(buttons)
          );
          return ctx.scene.leave();
        } catch (error) {
          console.error('Ошибка при сохранении встречи:', error);
          await ctx.reply('Произошла ошибка при сохранении встречи. Попробуйте позже.');
          return ctx.scene.leave();
        }
      }
    );

    // Сцена редактирования встречи
    const editEventWizard = new Scenes.WizardScene<BotContext>(
      'edit-event-wizard',
      async (ctx: BotContext) => {
        if (!isAdmin(ctx.from?.id)) {
          await ctx.reply('У вас нет прав администратора.');
          return ctx.scene.leave();
        }
        const state = ctx.scene.state as EventSceneState;
        const eventId = state.eventId;
        const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });
        
        if (!event) {
          await ctx.reply('Встреча не найдена.');
          return ctx.scene.leave();
        }

        const getButtons = (event: Event) => [
          [Markup.button.callback('✏️ Название', 'edit_title')],
          [Markup.button.callback('✏️ Дата начала', 'edit_start_date')],
          [Markup.button.callback('✏️ Дата окончания', 'edit_end_date')],
          [Markup.button.callback('✏️ Описание', 'edit_description')],
          [Markup.button.callback(`✏️ Возможно оплатить при встрече: ${event.allowOnSitePayment ? '✅ Да' : '❌ Нет'}`, 'edit_onsite_payment')],
          [Markup.button.callback('✏️ Стоимость при встрече', 'edit_full_payment')],
          [Markup.button.callback('✏️ Стоимость при оплате заранее', 'edit_advance_payment')],
          [Markup.button.callback('✏️ Срок оплаты заранее', 'edit_advance_deadline')],
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
          `Стоимость и варианты оплаты:\n` +
          `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
          `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
          `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
          `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
          `Выберите поле для редактирования:`,
          Markup.inlineKeyboard(getButtons(event))
        );
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        if (!ctx.callbackQuery) {
          return;
        }

        const eventId = ctx.scene.state.eventId;
        const event = await this.dataSource.manager.findOneBy(Event, { id: eventId });

        if (!event) {
          await ctx.reply('Встреча не найдена.');
          return ctx.scene.leave();
        }

        const getButtons = (event: Event) => [
          [Markup.button.callback('✏️ Название', 'edit_title')],
          [Markup.button.callback('✏️ Дата начала', 'edit_start_date')],
          [Markup.button.callback('✏️ Дата окончания', 'edit_end_date')],
          [Markup.button.callback('✏️ Описание', 'edit_description')],
          [Markup.button.callback(`✏️ Возможно оплатить при встрече: ${event.allowOnSitePayment ? '✅ Да' : '❌ Нет'}`, 'edit_onsite_payment')],
          [Markup.button.callback('✏️ Стоимость при встрече', 'edit_full_payment')],
          [Markup.button.callback('✏️ Стоимость при оплате заранее', 'edit_advance_payment')],
          [Markup.button.callback('✏️ Срок оплаты заранее', 'edit_advance_deadline')],
          [Markup.button.callback(event.isPublished ? '📝 Сделать черновиком' : '✅ Опубликовать', 'toggle_publish')],
          [Markup.button.callback(event.isCancelled ? '✅ Восстановить встречу' : '❌ Отменить встречу', 'toggle_cancel')],
          [Markup.button.callback('🗑 Удалить встречу', 'delete_event')],
          [Markup.button.callback('📋 Встречи', 'admin_events'), 
           Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ];

        const action = ctx.callbackQuery.data;

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
          case 'edit_onsite_payment':
            if (!ctx.callbackQuery) {
              return;
            }
            event.allowOnSitePayment = !event.allowOnSitePayment;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery(event.allowOnSitePayment ? '✅ Оплата при встрече разрешена' : '❌ Оплата при встрече запрещена');
            
            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(getButtons(event))
            );
            return;
          case 'edit_full_payment':
            ctx.scene.state.editingField = 'fullPaymentAmount';
            await ctx.reply(
              `Текущая стоимость при оплате при встрече: ${event.fullPaymentAmount} грн.\n` +
              `Введите новую стоимость (только число, без валюты):`,
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]])
            );
            break;
          case 'edit_advance_payment':
            ctx.scene.state.editingField = 'advancePaymentAmount';
            await ctx.reply(
              `Текущая стоимость при оплате заранее: ${event.advancePaymentAmount ? `${event.advancePaymentAmount} грн.` : 'Не установлена'}\n` +
              `Введите новую стоимость (только число, без валюты, или 0 чтобы отключить):`,
              Markup.inlineKeyboard([[Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]])
            );
            break;
          case 'edit_advance_deadline':
            if (!event.advancePaymentAmount) {
              await ctx.answerCbQuery('Сначала установите стоимость при оплате заранее');
              return;
            }
            ctx.scene.state.editingField = 'advancePaymentDeadline';
            await ctx.reply(
              `Текущий срок оплаты заранее: ${event.advancePaymentDeadline ? formatDate(event.advancePaymentDeadline) : 'Не установлен'}\n` +
              `Введите новую дату и время (ДД.ММ.ГГГГ, ЧЧ:ММ):`,
              Markup.inlineKeyboard([
                [Markup.button.callback('⏰ За сутки до начала встречи', 'set_deadline_day_before')],
                [Markup.button.callback('❌ Отменить редактирование', 'cancel_edit')]
              ])
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
            
            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(getButtons(event))
            );
            return;
          case 'toggle_cancel':
            event.isCancelled = !event.isCancelled;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery(event.isCancelled ? 'Встреча отменена!' : 'Встреча восстановлена');
            
            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(getButtons(event))
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
          case 'set_onsite_yes':
            event.allowOnSitePayment = true;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery('✅ Оплата при встрече разрешена');
            
            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(getButtons(event))
            );
            return;
          case 'set_onsite_no':
            event.allowOnSitePayment = false;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery('❌ Оплата при встрече запрещена');
            
            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(getButtons(event))
            );
            return;
          case 'set_deadline_day_before':
            const deadline = new Date(event.startDate);
            deadline.setDate(deadline.getDate() - 1);
            event.advancePaymentDeadline = deadline;
            await this.dataSource.manager.save(event);
            await ctx.answerCbQuery('✅ Срок оплаты установлен за сутки до начала встречи');
            
            await ctx.editMessageText(
              `Редактирование встречи:\n\n` +
              `Название: ${event.title}\n` +
              `Дата начала: ${formatDate(event.startDate)}\n` +
              `Дата окончания: ${formatDate(event.endDate)}\n` +
              `Описание: ${event.description}\n` +
              `Стоимость и варианты оплаты:\n` +
              `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
              `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
              `\nСтатус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` +
              `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n\n` +
              `Выберите поле для редактирования:`,
              Markup.inlineKeyboard(getButtons(event))
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
            case 'fullPaymentAmount':
              const fullAmount = parseFloat(newValue);
              if (isNaN(fullAmount) || fullAmount < 0) {
                await ctx.reply('Пожалуйста, введите корректную сумму (положительное число):');
                return;
              }
              event.fullPaymentAmount = fullAmount;
              break;
            case 'advancePaymentAmount':
              const advanceAmount = parseFloat(newValue);
              if (isNaN(advanceAmount) || advanceAmount < 0) {
                await ctx.reply('Пожалуйста, введите корректную сумму (положительное число):');
                return;
              }
              event.advancePaymentAmount = advanceAmount === 0 ? null : advanceAmount;
              if (advanceAmount === 0) {
                event.advancePaymentDeadline = null;
              }
              break;
            case 'advancePaymentDeadline':
              const parsedDeadline = parseDateTime(newValue);
              if (!parsedDeadline) {
                await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ:');
                return;
              }
              event.advancePaymentDeadline = parsedDeadline;
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
            [Markup.button.callback(`✏️ Возможно оплатить при встрече: ${event.allowOnSitePayment ? '✅ Да' : '❌ Нет'}`, 'edit_onsite_payment')],
            [Markup.button.callback('✏️ Стоимость при встрече', 'edit_full_payment')],
            [Markup.button.callback('✏️ Стоимость при оплате заранее', 'edit_advance_payment')],
            [Markup.button.callback('✏️ Срок оплаты заранее', 'edit_advance_deadline')],
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
            `Стоимость и варианты оплаты:\n` +
            `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${formatDate(event.advancePaymentDeadline)})` : ''}\n` : ''}` +
            `${event.fullPaymentAmount ? `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ` или при встрече` : ''}\n` : ''}` +
            `\nВыберите поле для редактирования:`,
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
    const mainMenuScene = new Scenes.BaseScene<BotContext>('main-menu');
    mainMenuScene.enter(async (ctx: BotContext) => {
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

    // Сцена для работы с реквизитами
    const paymentDetailsScene = new Scenes.WizardScene<BotContext>(
      'payment-details',
      async (ctx: BotContext) => {
        if (!isAdmin(ctx.from?.id)) {
          await ctx.reply('У вас нет прав администратора.');
          return ctx.scene.leave();
        }

        const state = ctx.scene.state as PaymentDetailsSceneState;

        if (state.editing) {
          const details = await this.dataSource.manager.findOneBy(PaymentDetails, { id: state.detailsId });
          if (!details) {
            await ctx.reply('Реквизиты не найдены.');
            return ctx.scene.leave();
          }
          state.title = details.title;
          await ctx.reply(`Текущее название: ${details.title}\nВведите новое название реквизитов:`);
        } else {
          state.title = '';
          await ctx.reply('Введите название реквизитов:');
        }
        return ctx.wizard.next();
      },
      async (ctx: BotContext) => {
        if (!ctx.message || !('text' in ctx.message)) {
          await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
          return;
        }

        const state = ctx.scene.state as PaymentDetailsSceneState;
        state.title = ctx.message.text;

        if (state.editing) {
          const details = await this.dataSource.manager.findOneBy(PaymentDetails, { id: state.detailsId });
          if (!details) {
            await ctx.reply('Реквизиты не найдены.');
            return ctx.scene.leave();
          }
          await ctx.reply(
            `Текущее описание: ${details.description}\nВведите новое описание реквизитов:`,
            Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_payment_details')]])
          );
        } else {
          await ctx.reply(
            'Введите описание реквизитов:',
            Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_payment_details')]])
          );
        }
        return ctx.wizard.next();
      },
      async (ctx: BotContext) => {
        if (ctx.callbackQuery && 'data' in ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_payment_details') {
          await ctx.answerCbQuery();
          await ctx.reply('Операция отменена');
          return ctx.scene.leave();
        }

        if (!ctx.message || !('text' in ctx.message)) {
          await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
          return;
        }

        const state = ctx.scene.state as PaymentDetailsSceneState;

        if (state.editing) {
          const details = await this.dataSource.manager.findOneBy(PaymentDetails, { id: state.detailsId });
          if (!details) {
            await ctx.reply('Реквизиты не найдены.');
            return ctx.scene.leave();
          }
          details.title = state.title;
          details.description = ctx.message.text;
          await this.dataSource.manager.save(details);
          await ctx.reply(
            '✅ Реквизиты успешно обновлены!',
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к реквизитам', 'payment_details')]])
          );
        } else {
          const paymentDetails = new PaymentDetails();
          paymentDetails.title = state.title;
          paymentDetails.description = ctx.message.text;
          await this.dataSource.manager.save(paymentDetails);
          await ctx.reply(
            '✅ Реквизиты успешно сохранены!',
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к реквизитам', 'payment_details')]])
          );
        }
        return ctx.scene.leave();
      }
    );

    this.stage = new Scenes.Stage<BotContext>([createEventWizard, editEventWizard, mainMenuScene, paymentDetailsScene]);
    
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
        `Встреча опубликована!\n\nНазвание: ${event.title}\nДата начала: ${formatDate(event.startDate)}\nДата окончания: ${formatDate(event.endDate)}\nОписание: ${event.description}\n\nСтоимость и варианты оплаты:\n` +
        `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
        `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
        `\nСтатус: Опубликована`,
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
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }

      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Админ-панель:',
        Markup.inlineKeyboard([
          [Markup.button.callback('📝 Создать встречу', 'create_event')],
          [Markup.button.callback('📋 Список встреч', 'admin_events')],
          [Markup.button.callback('💳 Реквизиты для оплаты', 'payment_details')],
          [Markup.button.callback('◀️ Назад', 'main_menu')]
        ])
      );
    });

    // Обработчик для кнопки "Реквизиты для оплаты"
    this.bot.action('payment_details', async (ctx: BotContext) => {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }

      const paymentDetails = await this.dataSource.manager.find(PaymentDetails);
      
      let message = 'Реквизиты для оплаты:\n\n';
      
      if (paymentDetails.length === 0) {
        message += 'Реквизиты еще не добавлены.';
      } else {
        paymentDetails.forEach((details, index) => {
          message += `${index + 1}. ${details.title}\n${details.description}\n\n`;
        });
      }

      await ctx.editMessageText(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить реквизиты', 'add_payment_details')],
          [Markup.button.callback('✏️ Редактировать реквизиты', 'edit_payment_details')],
          [Markup.button.callback('◀️ Назад', 'admin')]
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

    this.bot.action('new_events', async (ctx) => {
      const now = new Date();
      const events = await this.dataSource.manager.find(Event, {
        where: {
          startDate: MoreThan(now),
          isPublished: true,
          isCancelled: false
        },
        relations: ['participants'],
        order: {
          startDate: 'ASC'
        }
      });

      if (events.length === 0) {
        await ctx.reply('На данный момент нет предстоящих встреч.');
        return;
      }

      for (const event of events) {
        const isParticipant = event.participants.some(p => p.user.telegramId === ctx.from?.id);
        const buttons = [
          [Markup.button.callback('📋 Подробнее', `event_details_${event.id}`)]
        ];

        if (isParticipant) {
          buttons.push([
            Markup.button.callback('❌ Отменить участие', `leave_event_${event.id}`),
            Markup.button.callback('💳 Оплатить', `pay_event_${event.id}`)
          ]);
        } else {
          buttons.push([Markup.button.callback('✅ Принять участие', `join_event_${event.id}`)]);
        }

        await ctx.reply(
          `📅 ${event.title}\n` +
          `Дата начала: ${formatDate(event.startDate)}\n` +
          `Дата окончания: ${formatDate(event.endDate)}\n` +
          `Стоимость и варианты оплаты:\n` +
          `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
          `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
          `\nСтатус: ${event.isPublished ? 'Опубликована' : 'Черновик'}`,
          Markup.inlineKeyboard(buttons)
        );
      }
    });

    // Обработчики для кнопок участия
    this.bot.action(/^join_event_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      const event = await this.dataSource.manager.findOne(Event, {
        where: { id: eventId },
        relations: ['participants']
      });

      if (!event) {
        await ctx.answerCbQuery('Встреча не найдена');
        return;
      }

      const isParticipant = event.participants.some(p => p.user.telegramId === ctx.from?.id);
      if (isParticipant) {
        await ctx.answerCbQuery('Вы уже участвуете в этой встрече');
        return;
      }

      // Формируем сообщение с информацией о встрече
      let messageText = `📅 ${event.title}\n\n` +
        `📝 Описание:\n${event.description}\n\n` +
        `🕒 Дата начала: ${formatDate(event.startDate)}\n` +
        `🕕 Дата окончания: ${formatDate(event.endDate)}\n` +
        `📍 Место: ${event.location || 'Не указано'}\n\n` +
        `Стоимость и варианты оплаты:\n` +
        `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
        `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
        `\nВыберите вариант оплаты:`;

      // Формируем кнопки в зависимости от доступных вариантов оплаты
      const buttons = [];

      const now = new Date();
      if (event.allowOnSitePayment) {
        buttons.push([Markup.button.callback(`💵 Оплата при встрече (${event.fullPaymentAmount} грн)`, `payment_onsite_${event.id}`)]);
      }

      if (event.advancePaymentAmount && event.advancePaymentDeadline && now < event.advancePaymentDeadline) {
        buttons.push([Markup.button.callback(`💳 Оплатить заранее (${event.advancePaymentAmount} грн)`, `payment_advance_${event.id}`)]);
        buttons.push([Markup.button.callback('⏰ Напомнить позже', `remind_later_${event.id}`)]);
      } else if (event.fullPaymentAmount && (!event.advancePaymentAmount || (event.advancePaymentDeadline && now >= event.advancePaymentDeadline))) {
        buttons.push([Markup.button.callback(`💳 Полная оплата (${event.fullPaymentAmount} грн)`, `payment_full_${event.id}`)]);
      }

      buttons.push([Markup.button.callback('❌ Отменить участие', `cancel_join_${event.id}`)]);

      await ctx.editMessageText(messageText, Markup.inlineKeyboard(buttons));
    });

    // Обработчики для различных вариантов оплаты
    this.bot.action(/^payment_onsite_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      await this.joinEvent(ctx, eventId, ParticipationStatus.PAYMENT_ON_SITE);
    });

    this.bot.action(/^payment_partial_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      await this.joinEvent(ctx, eventId, ParticipationStatus.PENDING_PAYMENT);
    });

    this.bot.action(/^payment_advance_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      await this.joinEvent(ctx, eventId, ParticipationStatus.PENDING_PAYMENT);
    });

    this.bot.action(/^payment_full_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      await this.joinEvent(ctx, eventId, ParticipationStatus.PENDING_PAYMENT);
    });

    this.bot.action(/^cancel_join_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Регистрация отменена',
        Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к списку встреч', 'new_events')]])
      );
    });

    this.bot.action(/^leave_event_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      const participant = await this.dataSource.manager.findOne(EventParticipant, {
        where: {
          event: { id: eventId },
          user: { telegramId: ctx.from?.id }
        }
      });

      if (!participant) {
        await ctx.answerCbQuery('Вы не участвуете в этой встрече');
        return;
      }

      await this.dataSource.manager.remove(participant);
      await ctx.answerCbQuery('Вы отменили участие во встрече');

      // Обновляем сообщение
      const event = await this.dataSource.manager.findOne(Event, {
        where: { id: eventId },
        relations: ['participants']
      });

      if (event) {
        const buttons = [
          [Markup.button.callback('📋 Подробнее', `event_details_${event.id}`)],
          [Markup.button.callback('✅ Принять участие', `join_event_${event.id}`)]
        ];

        await ctx.editMessageText(
          `📅 ${event.title}\n` +
          `Дата начала: ${formatDate(event.startDate)}\n` +
          `Дата окончания: ${formatDate(event.endDate)}\n` +
          `Стоимость и варианты оплаты:\n` +
          `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
          `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
          `\nСтатус: ${event.isPublished ? 'Опубликована' : 'Черновик'}`,
          Markup.inlineKeyboard(buttons)
        );
      }
    });

    this.bot.action(/^event_details_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      const event = await this.dataSource.manager.findOne(Event, {
        where: { id: eventId },
        relations: ['participants']
      });

      if (!event) {
        await ctx.answerCbQuery('Встреча не найдена');
        return;
      }

      const isParticipant = event.participants.some(p => p.user.telegramId === ctx.from?.id);
      const buttons = [
        [Markup.button.callback('◀️ Назад к списку', 'new_events')]
      ];

      if (isParticipant) {
        buttons.push([
          Markup.button.callback('❌ Отменить участие', `leave_event_${event.id}`),
          Markup.button.callback('💳 Оплатить', `pay_event_${event.id}`)
        ]);
      } else {
        buttons.push([Markup.button.callback('✅ Принять участие', `join_event_${event.id}`)]);
      }

      await ctx.reply(
        `📅 ${event.title}\n\n` +
        `📝 Описание:\n${event.description}\n\n` +
        `🕒 Дата начала: ${formatDate(event.startDate)}\n` +
        `🕕 Дата окончания: ${formatDate(event.endDate)}\n` +
        `👥 Участников: ${event.participants.length}`,
        Markup.inlineKeyboard(buttons)
      );
    });

    this.bot.action(/^pay_event_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery('Функция оплаты будет добавлена позже');
    });

    this.bot.action('my_events', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Мои встречи:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Ближайшие', 'my_upcoming_events')],
          [Markup.button.callback('Прошедшие', 'my_past_events')],
          [Markup.button.callback('◀️ Назад', 'main_menu')]
        ])
      );
    });

    this.bot.action('my_upcoming_events', async (ctx) => {
      const now = new Date();
      const events = await this.dataSource.manager.find(Event, {
        where: {
          startDate: MoreThan(now),
          isPublished: true,
          isCancelled: false,
          participants: {
            user: {
              telegramId: ctx.from?.id
            }
          }
        },
        relations: ['participants'],
        order: {
          startDate: 'ASC'
        }
      });

      if (events.length === 0) {
        await ctx.editMessageText(
          'У вас нет предстоящих встреч.',
          Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'my_events')]])
        );
        return;
      }

      let messageText = 'Ваши предстоящие встречи:\n\n';
      for (const event of events) {
        const participant = event.participants.find(p => p.user.telegramId === ctx.from?.id);
        messageText += `📅 ${event.title}\n` +
          `Дата начала: ${formatDate(event.startDate)}\n` +
          `Дата окончания: ${formatDate(event.endDate)}\n` +
          `Стоимость и варианты оплаты:\n` +
          `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
          `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
          `Статус оплаты: ${participant?.status === ParticipationStatus.PAYMENT_CONFIRMED ? '✅ Оплачено' : '❌ Не оплачено'}\n\n`;
      }

      const buttons = events.map(event => [
        Markup.button.callback(`📋 Подробнее "${event.title}"`, `event_details_${event.id}`)
      ]);
      buttons.push([Markup.button.callback('◀️ Назад', 'my_events')]);

      await ctx.editMessageText(
        messageText,
        Markup.inlineKeyboard(buttons)
      );
    });

    this.bot.action('my_past_events', async (ctx) => {
      const now = new Date();
      const events = await this.dataSource.manager.find(Event, {
        where: {
          startDate: LessThan(now),
          isPublished: true,
          participants: {
            user: {
              telegramId: ctx.from?.id
            }
          }
        },
        relations: ['participants'],
        order: {
          startDate: 'DESC'
        }
      });

      if (events.length === 0) {
        await ctx.editMessageText(
          'У вас нет прошедших встреч.',
          Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'my_events')]])
        );
        return;
      }

      let messageText = 'Ваши прошедшие встречи:\n\n';
      for (const event of events) {
        const participant = event.participants.find(p => p.user.telegramId === ctx.from?.id);
        messageText += `📅 ${event.title}\n` +
          `Дата начала: ${formatDate(event.startDate)}\n` +
          `Дата окончания: ${formatDate(event.endDate)}\n` +
          `Стоимость и варианты оплаты:\n` +
          `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
          `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
          `Статус: ${event.isCancelled ? '❌ Отменена' : '✅ Завершена'}\n` +
          `Статус оплаты: ${participant?.status === ParticipationStatus.PAYMENT_CONFIRMED ? '✅ Оплачено' : '❌ Не оплачено'}\n\n`;
      }

      const buttons = events.map(event => [
        Markup.button.callback(`📋 Подробнее "${event.title}"`, `event_details_${event.id}`)
      ]);
      buttons.push([Markup.button.callback('◀️ Назад', 'my_events')]);

      await ctx.editMessageText(
        messageText,
        Markup.inlineKeyboard(buttons)
      );
    });

    this.bot.action(/^remind_later_(\d+)$/, async (ctx) => {
      const eventId = parseInt(ctx.match[1]);
      await ctx.answerCbQuery('Мы напомним вам об оплате позже');
      await ctx.editMessageText(
        'Мы напомним вам об оплате позже. Вы можете вернуться к списку встреч.',
        Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к списку встреч', 'new_events')]])
      );
    });

    // Обработчик для кнопки "Добавить реквизиты"
    this.bot.action('add_payment_details', async (ctx: BotContext) => {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }
      await ctx.answerCbQuery();
      ctx.scene.state = {
        title: '',
        editing: false
      };
      await ctx.scene.enter('payment-details');
    });

    // Обработчик для кнопки "Редактировать реквизиты"
    this.bot.action('edit_payment_details', async (ctx: BotContext) => {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }

      const paymentDetails = await this.dataSource.manager.find(PaymentDetails);
      
      if (paymentDetails.length === 0) {
        await ctx.answerCbQuery('Нет сохраненных реквизитов');
        return;
      }

      const buttons = paymentDetails.map(details => [
        Markup.button.callback(
          `${details.title}`,
          `edit_payment_details_${details.id}`
        )
      ]);

      buttons.push([Markup.button.callback('◀️ Назад', 'payment_details')]);

      await ctx.editMessageText(
        'Выберите реквизиты для редактирования:',
        Markup.inlineKeyboard(buttons)
      );
    });

    // Обработчик для выбора конкретных реквизитов для редактирования
    this.bot.action(/^edit_payment_details_(\d+)$/, async (ctx: BotContext) => {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }

      if (!ctx.match?.[1]) {
        await ctx.answerCbQuery('Ошибка: неверный формат данных');
        return;
      }

      const detailsId = parseInt(ctx.match[1]);
      const details = await this.dataSource.manager.findOneBy(PaymentDetails, { id: detailsId });

      if (!details) {
        await ctx.answerCbQuery('Реквизиты не найдены');
        return;
      }

      ctx.scene.state = {
        detailsId,
        editing: true,
        title: ''
      };
      await ctx.scene.enter('payment-details');
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

    buttons.push([Markup.button.callback('◀️ Назад', 'admin_events')]);

    await ctx.editMessageText(
      `${title}:\n\n${messageText}`,
      Markup.inlineKeyboard(buttons)
    );
  }

  private async joinEvent(ctx: any, eventId: number, status: ParticipationStatus) {
    const event = await this.dataSource.manager.findOne(Event, {
      where: { id: eventId },
      relations: ['participants']
    });

    if (!event) {
      await ctx.answerCbQuery('Встреча не найдена');
      return;
    }

    let user = await this.dataSource.manager.findOne(User, { where: { telegramId: ctx.from!.id } });
    if (!user) {
      user = new User();
      user.telegramId = ctx.from!.id;
      user.username = ctx.from?.username || null;
      user.firstName = ctx.from?.first_name || null;
      user.lastName = ctx.from?.last_name || null;
      await this.dataSource.manager.save(user);
    }

    const participant = new EventParticipant();
    participant.user = user;
    participant.event = event;
    participant.status = status;
    await this.dataSource.manager.save(participant);

    await ctx.answerCbQuery('Вы успешно зарегистрировались на встречу!');
    
    // Обновляем сообщение
    const buttons = [
      [Markup.button.callback('📋 Подробнее', `event_details_${event.id}`)],
      [
        Markup.button.callback('❌ Отменить участие', `leave_event_${event.id}`),
        Markup.button.callback('💳 Оплатить', `pay_event_${event.id}`)
      ]
    ];

    await ctx.editMessageText(
      `📅 ${event.title}\n` +
      `Дата начала: ${formatDate(event.startDate)}\n` +
      `Дата окончания: ${formatDate(event.endDate)}\n` +
      `Стоимость и варианты оплаты:\n` +
      `${event.allowOnSitePayment ? `• ${event.fullPaymentAmount} грн. в случае оплаты при встрече\n` : ''}` +
      `${event.advancePaymentAmount ? `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? `, не позднее ${formatDate(event.advancePaymentDeadline)}` : ''}\n` : ''}` +
      `\nСтатус: ${event.isPublished ? 'Опубликована' : 'Черновик'}`,
      Markup.inlineKeyboard(buttons)
    );
  }

  public getWebhookCallback(path: string) {
    return this.bot.webhookCallback(path);
  }
  
  public async setWebhook(url: string) {
    await this.bot.telegram.setWebhook(url);
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

    this.bot.command('events', async (ctx) => {
      await ctx.reply(
        'Выберите тип встреч:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Ближайшие', 'admin_upcoming_events')],
          [Markup.button.callback('Прошедшие', 'admin_past_events')],
          [Markup.button.callback('Все', 'admin_all_events')]
        ])
      );
    });

    this.bot.command('my_events', async (ctx) => {
      await ctx.reply(
        'Мои встречи:',
        Markup.inlineKeyboard([
          [Markup.button.callback('Ближайшие', 'my_upcoming_events')],
          [Markup.button.callback('Прошедшие', 'my_past_events')]
        ])
      );
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '🤖 Помощь по использованию бота:\n\n' +
        '/start - открыть главное меню\n' +
        '/events - просмотр всех встреч\n' +
        '/my_events - просмотр моих встреч\n' +
        '/help - показать это сообщение\n\n' +
        'Для администраторов:\n' +
        '• Создание новых встреч\n' +
        '• Редактирование существующих встреч\n' +
        '• Публикация и отмена встреч'
      );
    });

    this.bot.action('info', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Это отличный клуб');
    });

    this.bot.action('admin', async (ctx) => {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }

      await ctx.answerCbQuery();
      await ctx.editMessageText(
        'Админ-панель:',
        Markup.inlineKeyboard([
          [Markup.button.callback('📝 Создать встречу', 'create_event')],
          [Markup.button.callback('📋 Список встреч', 'admin_events')],
          [Markup.button.callback('💳 Реквизиты для оплаты', 'payment_details')],
          [Markup.button.callback('◀️ Назад', 'main_menu')]
        ])
      );
    });

    // Обработчик для кнопки "Реквизиты для оплаты"
    this.bot.action('payment_details', async (ctx: BotContext) => {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора');
        return;
      }

      const paymentDetails = await this.dataSource.manager.find(PaymentDetails);
      
      let message = 'Реквизиты для оплаты:\n\n';
      
      if (paymentDetails.length === 0) {
        message += 'Реквизиты еще не добавлены.';
      } else {
        paymentDetails.forEach((details, index) => {
          message += `${index + 1}. ${details.title}\n${details.description}\n\n`;
        });
      }

      await ctx.editMessageText(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить реквизиты', 'add_payment_details')],
          [Markup.button.callback('✏️ Редактировать реквизиты', 'edit_payment_details')],
          [Markup.button.callback('◀️ Назад', 'admin')]
        ])
      );
    });

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

  private setupErrorHandling(): void {
    this.bot.catch((err: any, ctx: Context) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      ctx.reply('Произошла ошибка при обработке запроса').catch(console.error);
    });
  }
}