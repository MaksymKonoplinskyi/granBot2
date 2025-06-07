import { Telegraf, Context, Markup } from 'telegraf';
import { Command } from '../commands/command.interface';
import { MessageSubscriber } from './subscribers/message.subscriber';
import { AppDataSource } from '../data-source';
import { Event } from '../entities/Event';

const ADMINS = (process.env.ADMINS || '').split(',').map(id => id.trim());
function isAdmin(userId: number | string | undefined): boolean {
  if (!userId) return false;
  return ADMINS.includes(String(userId));
}

export class TelegramBot {
  private readonly bot: Telegraf<Context>;
  private isInitialized = false;

  constructor(private readonly token: string) {
    this.bot = new Telegraf(this.token);
    this.setupErrorHandling();
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
      // if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback('Админка', 'admin')]);
      // }
      return ctx.reply(
        'Добро пожаловать! Выберите действие:',
        Markup.inlineKeyboard(buttons)
      );
    });

    this.bot.action('info', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Это отличный клуб');
    });
  }

  public addAdminFeatures() {
    this.bot.command('create_event', async (ctx) => {
      if (!isAdmin(ctx.from?.id)) {
        return ctx.reply('У вас нет прав администратора.');
      }
      // Пример: /create_event Название | Описание | 2024-07-01 18:00
      const [title, description, dateStr] = ctx.message.text.replace('/create_event', '').split('|').map(s => s.trim());
      if (!title || !description || !dateStr) {
        return ctx.reply('Формат: /create_event Название | Описание | Дата (YYYY-MM-DD HH:mm)');
      }
      const event = new Event();
      event.title = title;
      event.description = description;
      event.date = new Date(dateStr);
      await AppDataSource.manager.save(event);
      ctx.reply('Встреча создана!');
    });

    // Аналогично реализуйте команды для редактирования/удаления
  }
}