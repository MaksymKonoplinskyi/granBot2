import { Context } from 'telegraf';
import { BotContext } from '../bot/bot';

export interface Command {
  name: string;
  execute(ctx: BotContext): void;
}