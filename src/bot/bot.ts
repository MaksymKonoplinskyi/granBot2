import { Telegraf, Context } from 'telegraf';
import { Command } from './commands/command.interface';

export class TelegramBot {
  private bot: Telegraf;

  constructor(token: string) {
    this.bot = new Telegraf(token);
  }

  public init(commands: Command[]): void {
    this.registerCommands(commands);
    this.bot.launch();
  }

  private registerCommands(commands: Command[]): void {
    commands.forEach(command => {
      this.bot.command(command.name, (ctx) => command.execute(ctx));
    });
  }
}