import { Telegraf, Context, Markup, Scenes, session } from 'telegraf';
import { Command } from '../commands/command.interface';
import { MessageSubscriber } from './subscribers/message.subscriber';
import { AppDataSource } from '../data-source';
import { Event } from '../entities/Event';
import { ADMINS } from '../config';
import { WizardContext } from 'telegraf/typings/scenes';


function isAdmin(userId: number | string | undefined): boolean {
  if (!userId) return false;
  return ADMINS.includes(String(userId));
}

export class TelegramBot {
  private readonly bot: Telegraf<Scenes.WizardContext>;
  private isInitialized = false;
  private stage: Scenes.Stage<Scenes.WizardContext>;

  constructor(private readonly token: string) {
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
        ctx.scene.session.event.title = ctx.message.text;
        // Сохраняем черновик в базу
        const event = new Event();
        event.title = ctx.scene.session.event.title;
        await AppDataSource.manager.save(event);
        ctx.scene.session.event.id = event.id;
        await ctx.reply(`Название: ${event.title}\n\nЭтап 2/4: Введите дату начала (YYYY-MM-DD HH:mm):`);
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        const event = await AppDataSource.manager.findOneBy(Event, { id: ctx.scene.session.event.id });
        if (!event) {
          await ctx.reply('Ошибка: встреча не найдена.');
          return ctx.scene.leave();
        }
        event.startDate = new Date(ctx.message.text);
        await AppDataSource.manager.save(event);
        ctx.scene.session.event.startDate = event.startDate;
        await ctx.reply(`Название: ${event.title}\nДата начала: ${event.startDate.toLocaleString()}\n\nЭтап 3/4: Введите дату окончания (YYYY-MM-DD HH:mm):`);
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        const event = await AppDataSource.manager.findOneBy(Event, { id: ctx.scene.session.event.id });
        if (!event) {
          await ctx.reply('Ошибка: встреча не найдена.');
          return ctx.scene.leave();
        }
        event.endDate = new Date(ctx.message.text);
        await AppDataSource.manager.save(event);
        ctx.scene.session.event.endDate = event.endDate;
        await ctx.reply(`Название: ${event.title}\nДата начала: ${event.startDate.toLocaleString()}\nДата окончания: ${event.endDate.toLocaleString()}\n\nЭтап 4/4: Введите описание встречи:`);
        return ctx.wizard.next();
      },
      async (ctx: any) => {
        const event = await AppDataSource.manager.findOneBy(Event, { id: ctx.scene.session.event.id });
        if (!event) {
          await ctx.reply('Ошибка: встреча не найдена.');
          return ctx.scene.leave();
        }
        event.description = ctx.message.text;
        await AppDataSource.manager.save(event);
        await ctx.reply(`Встреча создана!\n\nНазвание: ${event.title}\nДата начала: ${event.startDate.toLocaleString()}\nДата окончания: ${event.endDate.toLocaleString()}\nОписание: ${event.description}`);
        return ctx.scene.leave();
      }
    );
    this.stage = new Scenes.Stage<Scenes.WizardContext>([createEventWizard]);
    this.bot.use(session());
    this.bot.use(this.stage.middleware());
  }

  public getWebhookCallback(path: string) {
    return this.bot.webhookCallback(path);
  }
  
  public async setWebhook(url: string) {
    await this.bot.telegram.setWebhook(url);
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
      console.log(`Bot started in webhook mode on ${webhookUrl}`);
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
      console.log('Bot started in polling mode');
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
  }

  public stop(reason?: string): void {
    if (reason) {
      console.log(`Stopping bot: ${reason}`);
    }
    this.bot.stop();
  }

  private registerCommands(commands: Command[]): void {
    commands.forEach(command => {
      this.bot.command(command.name, ctx => command.execute(ctx));
    });
  }

  private registerSubscribers(subscribers: MessageSubscriber[]): void {
    subscribers.forEach(subscriber => {
      this.bot.on(subscriber.messageType, ctx => subscriber.handle(ctx));
    });
  }

  private setupErrorHandling(): void {
    this.bot.catch((err: any, ctx: Context) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      ctx.reply('Произошла ошибка при обработке запроса').catch(console.error);
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
          [Markup.button.callback('Создать встречу', 'create_event'), Markup.button.callback('Редактировать встречу', 'admin_edit_event')],
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

    // Аналогично реализуйте команды для редактирования/удаления
  }
}