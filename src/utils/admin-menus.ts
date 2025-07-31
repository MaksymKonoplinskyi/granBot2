import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { safeEditOrReply } from './message-utils'

export async function showEventsManagementMenu(ctx: BotContext): Promise<void> {
  const adminMenuText = 'Управление встречами:'
  const buttons = [[Markup.button.callback('📅 Ближайшие встречи', 'admin_upcoming_events')], [Markup.button.callback('📜 Прошедшие встречи', 'admin_past_events')], [Markup.button.callback('📋 Все встречи', 'admin_all_events')], [Markup.button.callback('➕ Создать встречу', 'create_event')], [Markup.button.callback('◀️ Админ панель', 'admin')]]

  await safeEditOrReply(ctx, adminMenuText, Markup.inlineKeyboard(buttons))
}
