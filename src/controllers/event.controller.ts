import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { MessageFormatter } from '../utils/formatters'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { ParticipationStatus } from '../entities/EventParticipant'

export class EventController {
  constructor(private eventService: EventService) {}

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
      const messageText = MessageFormatter.formatEventDetails(event)

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
        await ctx.editMessageText(messageText, Markup.inlineKeyboard(buttons))
      } else {
        await ctx.reply(messageText, Markup.inlineKeyboard(buttons))
      }
    } catch (error) {
      console.error('Error showing event details:', error)
      await ctx.reply(MESSAGES.ERROR_EVENT_NOT_FOUND)
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
      await this.showEventDetails(ctx, eventId)
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
        await ctx.reply(MESSAGES.EMPTY_USER_EVENTS, Markup.inlineKeyboard([[Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
        return
      }

      const messageText = (showPast ? 'Ваши прошедшие встречи:\n\n' : 'Ваши ближайшие встречи:\n\n') + MessageFormatter.formatEventList(events)

      const buttons = events.map(event => [Markup.button.callback(`📋 ${event.title}`, `event_details_${event.id}`)])

      buttons.push([Markup.button.callback(showPast ? BUTTONS.UPCOMING_EVENTS : 'Прошедшие встречи', `toggle_events${showPast ? '' : '_past'}_my`)])
      buttons.push([Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')])

      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, Markup.inlineKeyboard(buttons))
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
      }
    }

    buttons.push([Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu'), Markup.button.callback(BUTTONS.BACK, isPast ? 'toggle_events_past' : 'toggle_events')])

    return buttons
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
