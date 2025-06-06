import { Context } from 'telegraf';

export interface Command {
  name: string;
  description: string;
  execute(ctx: Context): Promise<void>;
}