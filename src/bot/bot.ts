import { Telegraf, Context } from 'telegraf';
import { Command } from '../commands/command.interface';
import { MessageSubscriber } from './subscribers/message.subscriber';

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
}