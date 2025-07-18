import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'

export async function showEventsManagementMenu(ctx: BotContext): Promise<void> {
  const adminMenuText = 'Управление встречами:'
  const buttons = [[Markup.button.callback('📅 Ближайшие встречи', 'admin_upcoming_events')], [Markup.button.callback('📜 Прошедшие встречи', 'admin_past_events')], [Markup.button.callback('📋 Все встречи', 'admin_all_events')], [Markup.button.callback('➕ Создать встречу', 'create_event')], [Markup.button.callback('◀️ Админ панель', 'admin')]]

  try {
    await ctx.editMessageText(adminMenuText, Markup.inlineKeyboard(buttons))
  } catch (error) {
    // Если редактирование не удалось, отправим новое сообщение
    await ctx.reply(adminMenuText, Markup.inlineKeyboard(buttons))
  }
}
