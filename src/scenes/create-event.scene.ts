import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { MESSAGES } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { DateFormatter } from '../utils/formatters'

interface CreateEventSceneState {
  step: 'title' | 'start_date' | 'end_date' | 'description' | 'full_payment' | 'advance_payment'
  title?: string
  startDate?: Date
  endDate?: Date
  description?: string
  fullPaymentAmount?: number
  advancePaymentAmount?: number | null
  allowOnSitePayment?: boolean
}

// Вспомогательная функция для парсинга даты в формате DD.MM.YYYY, HH:mm
function parseDateTime(dateTimeStr: string): Date | null {
  const parts = dateTimeStr.match(/^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2})$/)
  if (!parts) {
    return null
  }
  const [_, day, month, year, hours, minutes] = parts.map(Number)
  const date = new Date(year, month - 1, day, hours, minutes, 0)
  return date
}

export const createEventScene = (eventService: EventService) => {
  const scene = new Scenes.BaseScene<BotContext>('create-event')

  scene.enter(async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    // Инициализируем состояние сцены
    ctx.session = ctx.session || {}
    ;(ctx.session as any).createEventState = {
      step: 'title',
    }

    await ctx.reply('Создание новой встречи\n\nШаг 1/6: Введите название встречи:', Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
  })

  scene.on('text', async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      const state = (ctx.session as any)?.createEventState as CreateEventSceneState

      switch (state.step) {
        case 'title':
          state.title = ctx.message.text
          state.step = 'start_date'
          await ctx.reply(`Название: ${state.title}\n\nШаг 2/6: Введите дату и время начала встречи в формате ДД.ММ.ГГГГ, ЧЧ:ММ\nПример: 25.07.2025, 11:00`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'start_date':
          const startDate = parseDateTime(ctx.message.text)
          if (!startDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }
          state.startDate = startDate
          state.step = 'end_date'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate)}\n\nШаг 3/6: Введите дату и время окончания встречи в формате ДД.ММ.ГГГГ, ЧЧ:ММ\nПример: 26.07.2025, 22:00`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'end_date':
          const endDate = parseDateTime(ctx.message.text)
          if (!endDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }
          if (endDate <= state.startDate!) {
            await ctx.reply('Дата окончания должна быть позже даты начала. Попробуйте еще раз.')
            return
          }
          state.endDate = endDate
          state.step = 'description'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate)}\n\nШаг 4/6: Введите описание встречи:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'description':
          state.description = ctx.message.text
          state.step = 'full_payment'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\n\nШаг 5/6: Введите стоимость участия в гривнах (только число):\nПример: 200`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'full_payment':
          const fullPayment = parseFloat(ctx.message.text)
          if (isNaN(fullPayment) || fullPayment < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число)')
            return
          }
          state.fullPaymentAmount = fullPayment
          state.step = 'advance_payment'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\n\nШаг 6/6: Предоплата заранее\nВведите стоимость при оплате заранее (грн) или 0 если предоплата не нужна:`, Markup.inlineKeyboard([[Markup.button.callback('0 - без предоплаты', 'no_advance_payment')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'advance_payment':
          const advancePayment = parseFloat(ctx.message.text)
          if (isNaN(advancePayment) || advancePayment < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число или 0)')
            return
          }

          state.advancePaymentAmount = advancePayment === 0 ? null : advancePayment
          state.allowOnSitePayment = true // По умолчанию разрешаем оплату на месте

          await createEvent(ctx, state, eventService)
          break
      }
    } catch (error) {
      console.error('Error in create event scene:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  scene.action('no_advance_payment', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.createEventState as CreateEventSceneState
    state.advancePaymentAmount = null
    state.allowOnSitePayment = true

    await createEvent(ctx, state, eventService)
  })

  scene.action('cancel_create', async ctx => {
    await ctx.answerCbQuery()
    await ctx.reply('Создание встречи отменено')
    return ctx.scene.leave()
  })

  return scene
}

async function createEvent(ctx: BotContext, state: CreateEventSceneState, eventService: EventService) {
  try {
    const eventData = {
      title: state.title!,
      description: state.description!,
      startDate: state.startDate!,
      endDate: state.endDate!,
      fullPaymentAmount: state.fullPaymentAmount!,
      advancePaymentAmount: state.advancePaymentAmount,
      advancePaymentDeadline: state.advancePaymentAmount ? new Date(state.startDate!.getTime() - 24 * 60 * 60 * 1000) : null, // За сутки до начала
      allowOnSitePayment: state.allowOnSitePayment!,
      location: null, // Можно добавить в будущем
      isPublished: false,
      isCancelled: false,
    }

    const event = await eventService.createEvent(eventData)

    await ctx.reply(`✅ Встреча успешно создана!\n\n` + `📅 ${event.title}\n` + `🕒 ${DateFormatter.formatDate(event.startDate)} - ${DateFormatter.formatDate(event.endDate)}\n` + `📝 ${event.description}\n` + `💰 Стоимость: ${event.fullPaymentAmount} грн\n` + `${event.advancePaymentAmount ? `💳 Предоплата: ${event.advancePaymentAmount} грн\n` : ''}` + `\n📝 Статус: Черновик (не опубликована)\n\n` + `Что дальше?`, Markup.inlineKeyboard([[Markup.button.callback('✅ Опубликовать сейчас', `publish_event_${event.id}`)], [Markup.button.callback('✏️ Редактировать', `edit_event_${event.id}`)], [Markup.button.callback('📋 К списку встреч', 'admin_events')], [Markup.button.callback('🏠 Главное меню', 'main_menu')]]))

    return ctx.scene.leave()
  } catch (error) {
    console.error('Error creating event:', error)
    await ctx.reply(MESSAGES.ERROR_GENERAL)
    return ctx.scene.leave()
  }
}
