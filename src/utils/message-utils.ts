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

/**
 * Удаляет предыдущее сообщение и отправляет новое
 * Используется для "чистых" переходов между разными типами контента
 */
export async function replaceMessage(ctx: BotContext, text: string, markup?: ReturnType<typeof Markup.inlineKeyboard>): Promise<void> {
  try {
    if (ctx.callbackQuery?.message) {
      // Удаляем предыдущее сообщение
      await ctx.deleteMessage()
      // Отправляем новое
      await ctx.reply(text, markup)
    } else {
      // Если нет callback query, просто отправляем сообщение
      await ctx.reply(text, markup)
    }
  } catch (error) {
    console.error('Error replacing message:', error)
    // Fallback - пытаемся просто отправить новое сообщение
    try {
      await ctx.reply(text, markup)
    } catch (fallbackError) {
      console.error('Fallback reply also failed:', fallbackError)
    }
  }
}

/**
 * Удаляет предыдущее сообщение и отправляет новое с фото
 * Используется для "чистых" переходов к контенту с изображениями
 */
export async function replaceWithPhoto(ctx: BotContext, fileId: string, caption: string, markup?: ReturnType<typeof Markup.inlineKeyboard>): Promise<void> {
  try {
    if (ctx.callbackQuery?.message) {
      // Удаляем предыдущее сообщение
      await ctx.deleteMessage()
      // Отправляем новое с фото
      await ctx.replyWithPhoto(fileId, {
        caption: caption,
        reply_markup: markup?.reply_markup,
      })
    } else {
      // Если нет callback query, просто отправляем сообщение с фото
      await ctx.replyWithPhoto(fileId, {
        caption: caption,
        reply_markup: markup?.reply_markup,
      })
    }
  } catch (error) {
    console.error('Error replacing with photo:', error)
    // Fallback - пытаемся просто отправить новое сообщение с фото
    try {
      await ctx.replyWithPhoto(fileId, {
        caption: caption,
        reply_markup: markup?.reply_markup,
      })
    } catch (fallbackError) {
      console.error('Fallback photo reply also failed:', fallbackError)
      // В крайнем случае отправляем просто текст
      try {
        await ctx.reply(caption, markup)
      } catch (textFallbackError) {
        console.error('Even text fallback failed:', textFallbackError)
      }
    }
  }
}
