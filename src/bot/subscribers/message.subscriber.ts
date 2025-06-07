import { Context } from 'telegraf';
import { UpdateType } from 'telegraf/typings/telegram-types';

export interface MessageSubscriber {
  messageType: UpdateType;
  handle(ctx: Context): void;
}