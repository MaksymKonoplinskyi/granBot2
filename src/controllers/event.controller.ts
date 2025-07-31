import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { MessageFormatter } from '../utils/formatters'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { ParticipationStatus } from '../entities/EventParticipant'
import { isAdmin } from '../utils/auth.utils'
import { PaymentDetailsController } from './payment-details.controller'
import { safeEditMessage } from '../utils/message-utils'

export class EventController {
  constructor(private eventService: EventService, private paymentDetailsController: PaymentDetailsController) {}

  async showUpcomingEvents(ctx: BotContext): Promise<void> {
    try {
      const events = await this.eventService.getUpcomingEvents(ctx.from?.id)

      if (events.length === 0) {
        await ctx.reply(MESSAGES.EMPTY_UPCOMING_EVENTS, Markup.inlineKeyboard([[Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
        return
      }

      const messageText = 'Ближайшие встречи:\n\n' + MessageFormatter.formatEventList(events)
      const buttons = events.map(event => [Markup.button.callback(`📋 ${event.title}`, `event_details_${event.id}`)])
      buttons.push([Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')])

      await ctx.reply(messageText, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing upcoming events:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async showEventDetails(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventDetails(eventId, ctx.from?.id)

      // Используем разное форматирование для админов и обычных пользователей
      const messageText = isAdmin(ctx.from?.id) ? MessageFormatter.formatEventDetailsForAdmin(event) : MessageFormatter.formatEventDetails(event)

      const buttons = this.getEventActionButtons(event, ctx.from?.id)

      // Если есть изображение, отправляем его отдельно
      if (event.imageFileId) {
        try {
          await ctx.replyWithPhoto(event.imageFileId, {
            caption: messageText,
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
          })
          return
        } catch (error) {
          console.error('Error sending photo:', error)
          // Если ошибка с изображением, отправляем обычное текстовое сообщение
        }
      }

      // Отправляем обычное текстовое сообщение
      if (ctx.callbackQuery) {
        await safeEditMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
      } else {
        await ctx.reply(messageText, Markup.inlineKeyboard(buttons))
      }
    } catch (error) {
      console.error('Error showing event details:', error)
      await ctx.reply(MESSAGES.ERROR_EVENT_NOT_FOUND)
    }
  }

  async updatePaymentChoice(ctx: BotContext, eventId: number, paymentType: string): Promise<void> {
    try {
      const status = this.getParticipationStatus(paymentType)
      await this.eventService.updateParticipationStatus(eventId, ctx.from!.id, status)

      // Показываем конкретное сообщение в зависимости от типа оплаты
      if (paymentType === 'onsite') {
        // Для оплаты на месте - показываем успешную регистрацию и дополнительную информацию
        await this.showSuccessfulRegistration(ctx, eventId)
      } else {
        // Для других типов оплаты (advance/full) - прямой переход к выбору реквизитов
        await ctx.answerCbQuery()
        await this.paymentDetailsController.showPaymentDetailsForPayment(ctx, eventId)
      }
    } catch (error) {
      console.error('Error updating payment choice:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async joinEvent(ctx: BotContext, eventId: number, paymentType: string): Promise<void> {
    try {
      const status = this.getParticipationStatus(paymentType)
      const userData = {
        username: ctx.from!.username,
        firstName: ctx.from!.first_name,
        lastName: ctx.from!.last_name,
      }
      await this.eventService.joinEvent(eventId, ctx.from!.id, status, userData)

      await ctx.answerCbQuery(MESSAGES.SUCCESS_JOINED_EVENT)

      // Показываем конкретное сообщение в зависимости от типа оплаты
      if (paymentType === 'onsite') {
        // Для оплаты на месте - показываем список "Мои встречи"
        await this.showUserEvents(ctx)
      } else {
        // Для других типов оплаты (advance/full) - переходим к выбору способа оплаты
        await safeEditMessage(ctx, 'Теперь выберите способ оплаты:', Markup.inlineKeyboard([[Markup.button.callback('💳 Выбрать способ оплаты', `pay_event_${eventId}`)]]))
      }
    } catch (error) {
      console.error('Error joining event:', error)

      if (error instanceof Error) {
        if (error.message === 'User already participating') {
          await ctx.answerCbQuery(MESSAGES.ERROR_ALREADY_PARTICIPANT)
        } else if (error.message === 'Event not found') {
          await ctx.answerCbQuery(MESSAGES.ERROR_EVENT_NOT_FOUND)
        } else {
          await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
        }
      }
    }
  }

  async leaveEvent(ctx: BotContext, eventId: number): Promise<void> {
    try {
      await this.eventService.leaveEvent(eventId, ctx.from!.id)

      await ctx.answerCbQuery(MESSAGES.SUCCESS_LEFT_EVENT)
      await this.showEventDetails(ctx, eventId)
    } catch (error) {
      console.error('Error leaving event:', error)

      if (error instanceof Error && error.message === 'User not participating') {
        await ctx.answerCbQuery(MESSAGES.ERROR_NOT_PARTICIPANT)
      } else {
        await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
      }
    }
  }

  async showUserEvents(ctx: BotContext, showPast: boolean = false): Promise<void> {
    try {
      const events = await this.eventService.getUserEvents(ctx.from!.id, !showPast)

      if (events.length === 0) {
        const emptyMessage = showPast ? 'У вас нет прошедших встреч.' : 'У вас нет предстоящих встреч.'

        if (ctx.callbackQuery) {
          await safeEditMessage(ctx, emptyMessage, Markup.inlineKeyboard([[Markup.button.callback(showPast ? '▶️ Ближайшие встречи' : '◀️ Прошедшие встречи', `toggle_events${showPast ? '' : '_past'}_my`)], [Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
        } else {
          await ctx.reply(emptyMessage, Markup.inlineKeyboard([[Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
        }
        return
      }

      const messageText = (showPast ? 'Ваши прошедшие встречи:\n\n' : 'Ваши ближайшие встречи:\n\n') + MessageFormatter.formatEventList(events)

      const buttons = events.map(event => [Markup.button.callback(`📋 ${event.title}`, `event_details_${event.id}`)])

      buttons.push([Markup.button.callback(showPast ? '▶️ Ближайшие встречи' : '◀️ Прошедшие встречи', `toggle_events${showPast ? '' : '_past'}_my`)])
      buttons.push([Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')])

      if (ctx.callbackQuery) {
        await safeEditMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
      } else {
        await ctx.reply(messageText, Markup.inlineKeyboard(buttons))
      }
    } catch (error) {
      console.error('Error showing user events:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  private getEventActionButtons(event: any, userId?: number): any[] {
    const buttons = []
    const now = new Date()
    const isPast = event.startDate < now

    if (!event.isCancelled && !isPast) {
      const userParticipation = event.userParticipationStatus

      if (!userParticipation) {
        buttons.push([Markup.button.callback(BUTTONS.JOIN_EVENT, `join_event_${event.id}`)])
      } else {
        buttons.push([Markup.button.callback(BUTTONS.LEAVE_EVENT, `leave_event_${event.id}`)])

        if (userParticipation === ParticipationStatus.PENDING_PAYMENT) {
          buttons.push([Markup.button.callback(BUTTONS.PAY_NOW, `pay_event_${event.id}`)])
        }

        // Для пользователей с PAYMENT_NOT_CHOSEN показываем варианты оплаты
        if (userParticipation === ParticipationStatus.PAYMENT_NOT_CHOSEN) {
          const paymentButtons = []

          if (event.allowOnSitePayment) {
            paymentButtons.push([Markup.button.callback(`${BUTTONS.PAY_ON_SITE} (${event.fullPaymentAmount} грн)`, `payment_onsite_${event.id}`)])
          }

          if (event.advancePaymentAmount && event.advancePaymentDeadline && now < event.advancePaymentDeadline) {
            paymentButtons.push([Markup.button.callback(`${BUTTONS.PAY_ADVANCE} (${event.advancePaymentAmount} грн)`, `payment_advance_${event.id}`)])
          }

          if (event.fullPaymentAmount && (!event.advancePaymentAmount || (event.advancePaymentDeadline && now >= event.advancePaymentDeadline))) {
            paymentButtons.push([Markup.button.callback(`${BUTTONS.PAY_FULL} (${event.fullPaymentAmount} грн)`, `payment_full_${event.id}`)])
          }

          buttons.push(...paymentButtons)
          buttons.push([Markup.button.callback('❌ Отменить участие', `cancel_participation_${event.id}`)])
        }

        // Добавляем кнопку "Оплатить заранее" если пользователь выбрал оплату на месте
        // и оплата заранее еще доступна
        if (userParticipation === ParticipationStatus.PAYMENT_ON_SITE && event.advancePaymentAmount && event.advancePaymentDeadline && now < event.advancePaymentDeadline) {
          buttons.push([Markup.button.callback(BUTTONS.PAY_ADVANCE, `pay_event_${event.id}`)])
        }
      }
    }

    buttons.push([Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu'), Markup.button.callback(BUTTONS.BACK, isPast ? 'toggle_events_past' : 'toggle_events')])

    return buttons
  }

  async showSuccessfulRegistration(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventDetails(eventId, ctx.from?.id)

      await ctx.answerCbQuery('Вы успешно зарегистрировались!')

      let message = `🎉 Вы успешно зарегистрировались на встречу!\n\n`
      message += `📅 ${event.title}\n`
      message += `🕒 ${event.startDate.toLocaleDateString('ru-RU')} в ${event.startDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}\n`
      if (event.location) {
        message += `📍 ${event.location}\n`
      }
      if (event.description) {
        message += `\n📝 ${event.description}\n`
      }

      const buttons = []

      // Добавляем кнопки с дополнительной информацией если она есть
      if (event.whatToBring) {
        buttons.push([Markup.button.callback('🎒 Что взять с собой', `what_to_bring_${eventId}`)])
      }

      if (event.howToGetThere) {
        buttons.push([Markup.button.callback('🗺️ Как добраться', `how_to_get_there_${eventId}`)])
      }

      buttons.push([Markup.button.callback('🏠 Главное меню', 'main_menu')])

      await safeEditMessage(ctx, message, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing successful registration:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private getParticipationStatus(paymentType: string): ParticipationStatus {
    switch (paymentType) {
      case 'onsite':
        return ParticipationStatus.PAYMENT_ON_SITE
      case 'advance':
      case 'full':
        return ParticipationStatus.PENDING_PAYMENT
      default:
        return ParticipationStatus.PENDING_PAYMENT
    }
  }
}
