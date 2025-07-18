import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { PaymentDetailsService } from '../services/payment-details.service'
import { ClubInfoService } from '../services/club-info.service'
import { MessageFormatter, DateFormatter } from '../utils/formatters'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { showEventsManagementMenu } from '../utils/admin-menus'

export class AdminController {
  constructor(private eventService: EventService, private paymentDetailsService: PaymentDetailsService, private clubInfoService: ClubInfoService) {}

  async showAdminPanel(ctx: BotContext): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    await ctx.answerCbQuery()
    await ctx.editMessageText(MESSAGES.ADMIN_PANEL, Markup.inlineKeyboard([[Markup.button.callback('📋 Встречи', 'admin_events'), Markup.button.callback(BUTTONS.CREATE_EVENT, 'create_event')], [Markup.button.callback('💳 Реквизиты для оплаты', 'payment_details')], [Markup.button.callback('ℹ️ О клубе', 'info')], [Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
  }

  async showEventsList(ctx: BotContext, type: 'upcoming' | 'past' | 'all'): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      let events
      let title

      switch (type) {
        case 'upcoming':
          events = await this.eventService.getUpcomingEventsAdmin()
          title = 'Ближайшие встречи'
          break
        case 'past':
          events = await this.eventService.getPastEventsAdmin()
          title = 'Прошедшие встречи'
          break
        case 'all':
          events = await this.eventService.getAllEventsAdmin()
          title = 'Все встречи'
          break
      }

      if (events.length === 0) {
        await ctx.editMessageText(`${title}:\n\nСписок пуст`, Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'admin_events')]]))
        return
      }

      const messageText = events
        .map(event => {
          return `📅 ${event.title}\n` + `Дата начала: ${DateFormatter.formatDate(event.startDate)}\n` + `Дата окончания: ${DateFormatter.formatDate(event.endDate)}\n` + `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` + `Отменена: ${event.isCancelled ? '❌ Да' : '✅ Нет'}\n` + `ID: ${event.id}\n`
        })
        .join('\n')

      const buttons = events.map(event => [Markup.button.callback(`✏️ Редактировать "${event.title}"`, `edit_event_${event.id}`)])

      buttons.push([Markup.button.callback('◀️ Назад', 'admin_events')])

      await ctx.editMessageText(`${title}:\n\n${messageText}`, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing events list:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async showEventsMenu(ctx: BotContext): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    await ctx.answerCbQuery()
    await showEventsManagementMenu(ctx)
  }

  async publishEvent(ctx: BotContext, eventId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      const isValid = await this.eventService.validateEventForPublish(eventId)
      if (!isValid) {
        await ctx.answerCbQuery('Не все поля заполнены. Заполните все обязательные поля перед публикацией.')
        return
      }

      await this.eventService.publishEvent(eventId)
      await ctx.answerCbQuery(MESSAGES.SUCCESS_EVENT_PUBLISHED)

      // Обновляем сообщение с информацией о встрече
      const event = await this.eventService.getEventById(eventId)
      if (event) {
        const eventText = `Название: ${event.title}\nДата начала: ${DateFormatter.formatDate(event.startDate)}\nДата окончания: ${DateFormatter.formatDate(event.endDate)}\nОписание: ${event.description}\n\nСтатус: Опубликована`
        await ctx.editMessageText(`Встреча опубликована!\n\n${eventText}`, Markup.inlineKeyboard([[Markup.button.callback('Редактировать', `edit_event_${event.id}`)]]))
      }
    } catch (error) {
      console.error('Error publishing event:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async confirmPayment(ctx: BotContext, eventId: number, userId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('У вас нет прав для этого действия')
      return
    }

    try {
      await this.eventService.confirmPayment(eventId, userId)

      // Уведомляем пользователя
      const event = await this.eventService.getEventById(eventId)
      if (event) {
        try {
          await ctx.telegram.sendMessage(userId, `✅ Ваша оплата за встречу "${event.title}" подтверждена!\n\nЖдем вас на встрече!`)
        } catch (error) {
          console.error('Error sending notification to user:', error)
        }
      }

      // Обновляем сообщение админа
      await ctx.editMessageText((ctx.callbackQuery?.message as any)?.text + '\n\n✅ Оплата подтверждена', { reply_markup: { inline_keyboard: [] } })
    } catch (error) {
      console.error('Error confirming payment:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async createEvent(ctx: BotContext): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора')
        return
      }

      await ctx.answerCbQuery()
      await ctx.scene.enter('create-event')
    } catch (error) {
      console.error('Error in createEvent:', error)
      await ctx.answerCbQuery('Ошибка при создании события')
    }
  }

  async editEvent(ctx: BotContext, eventId: number): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора')
        return
      }

      await ctx.answerCbQuery()
      await ctx.scene.enter('edit-event', { eventId })
    } catch (error) {
      console.error('Error in editEvent:', error)
      await ctx.answerCbQuery('Ошибка при редактировании события')
    }
  }

  async schedulePublish(ctx: BotContext, eventId: number): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery('У вас нет прав администратора')
        return
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(`📅 Введите дату и время для отложенной публикации в формате ДД.ММ.ГГГГ, ЧЧ:ММ\n\nПример: ${DateFormatter.generateDateTimeExample()}`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', `edit_event_${eventId}`)]]))

      // Устанавливаем состояние для обработки ввода даты
      // Это будет обработано в отдельном middleware
      ctx.session = ctx.session || {}
      ;(ctx.session as any).awaitingScheduleDate = eventId
    } catch (error) {
      console.error('Error in schedulePublish:', error)
      await ctx.answerCbQuery('Ошибка при настройке отложенной публикации')
    }
  }
}
