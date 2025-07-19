import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'

/**
 * Безопасное редактирование сообщения с автоматическим определением типа
 */
export async function safeEditMessage(ctx: BotContext, text: string, markup?: ReturnType<typeof Markup.inlineKeyboard>): Promise<void> {
  try {
    const message = ctx.callbackQuery?.message as any

    if (message?.photo && message?.photo.length > 0) {
      await ctx.editMessageCaption(text, markup)
    } else {
      await ctx.editMessageText(text, markup)
    }
  } catch (error: any) {
    try {
      if (error.message.includes('no text in the message')) {
        await ctx.editMessageCaption(text, markup)
      } else if (error.message.includes('message is not modified')) {
        await ctx.answerCbQuery()
      } else {
        await ctx.answerCbQuery()
        await ctx.reply(text, markup)
      }
    } catch (fallbackError) {
      try {
        await ctx.answerCbQuery('Произошла ошибка при обновлении сообщения')
      } catch (cbError) {
        console.error('Failed to answer callback query:', cbError)
      }
    }
  }
}

/**
 * Безопасное редактирование сообщения только для случаев с callback query
 * Если нет callback query, отправляет обычное сообщение
 */
export async function safeEditOrReply(ctx: BotContext, text: string, markup?: ReturnType<typeof Markup.inlineKeyboard>): Promise<void> {
  if (ctx.callbackQuery) {
    await safeEditMessage(ctx, text, markup)
  } else {
    await ctx.reply(text, markup)
  }
}
