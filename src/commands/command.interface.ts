import { Context } from 'telegraf';

export interface Command {
  name: string;
  execute(ctx: any): void;
}