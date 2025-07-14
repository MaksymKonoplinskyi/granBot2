import { Context } from 'telegraf'
import { BotContext } from '../types/bot.types'

export interface Command {
  name: string
  execute(ctx: BotContext): void
}
