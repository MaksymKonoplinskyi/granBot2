import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { MESSAGES } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { DateFormatter } from '../utils/formatters'

interface CreateEventSceneState {
  step: 'title' | 'start_date' | 'end_date' | 'description' | 'image' | 'full_payment' | 'advance_payment' | 'advance_payment_deadline' | 'what_to_bring' | 'how_to_get_there'
  title?: string
  startDate?: Date
  endDate?: Date
  description?: string
  imageFileId?: string | null
  imageFileName?: string | null
  fullPaymentAmount?: number
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
  allowOnSitePayment?: boolean
  whatToBring?: string | null
  howToGetThere?: string | null
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

    await ctx.reply('Создание новой встречи\n\nШаг 1/8: Введите название встречи:', Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
  })

  // Обработка изображений
  scene.on('photo', async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    const state = (ctx.session as any)?.createEventState as CreateEventSceneState
    if (!state || state.step !== 'image') {
      await ctx.reply('Сейчас не время для загрузки изображения')
      return
    }

    try {
      // Получаем самое большое изображение из массива
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      state.imageFileId = photo.file_id
      state.imageFileName = `event_image_${Date.now()}.jpg`
      state.step = 'full_payment'

      await ctx.reply(`✅ Изображение сохранено!\n\nНазвание: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\n🖼 Изображение: загружено\n\nШаг 6/8: Введите стоимость участия в гривнах (только число):\nПример: 200`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
    } catch (error) {
      console.error('Error handling photo:', error)
      await ctx.reply('Ошибка при загрузке изображения. Попробуйте еще раз или пропустите этот шаг.')
    }
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
          await ctx.reply(`Название: ${state.title}\n\nШаг 2/8: Введите дату и время начала встречи в формате ДД.ММ.ГГГГ, ЧЧ:ММ\nПример: 25.07.2025, 11:00`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'start_date':
          const startDate = parseDateTime(ctx.message.text)
          if (!startDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }
          state.startDate = startDate
          state.step = 'end_date'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate)}\n\nШаг 3/8: Введите дату и время окончания встречи в формате ДД.ММ.ГГГГ, ЧЧ:ММ\nПример: 26.07.2025, 22:00`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
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
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate)}\n\nШаг 4/8: Введите описание встречи:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'description':
          state.description = ctx.message.text
          state.step = 'image'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\n\nШаг 5/8: Отправьте изображение для встречи или нажмите "Пропустить"`, Markup.inlineKeyboard([[Markup.button.callback('⏭ Пропустить', 'skip_image')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'image':
          // Обработка изображения - пока просто пропускаем
          state.step = 'full_payment'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\n\nШаг 6/8: Введите стоимость участия в гривнах (только число):\nПример: 200`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'full_payment':
          const fullPayment = parseFloat(ctx.message.text)
          if (isNaN(fullPayment) || fullPayment < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число)')
            return
          }
          state.fullPaymentAmount = fullPayment
          state.step = 'advance_payment'
          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\n\nШаг 7/8: Предоплата заранее\nВведите стоимость при оплате заранее (грн) или 0 если предоплата не нужна:`, Markup.inlineKeyboard([[Markup.button.callback('0 - без предоплаты', 'no_advance_payment')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'advance_payment':
          const advancePayment = parseFloat(ctx.message.text)
          if (isNaN(advancePayment) || advancePayment < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число или 0)')
            return
          }

          state.advancePaymentAmount = advancePayment === 0 ? null : advancePayment
          state.allowOnSitePayment = true // По умолчанию разрешаем оплату на месте

          // Если есть предоплата, переходим к настройке крайнего срока
          if (advancePayment > 0) {
            state.step = 'advance_payment_deadline'
            const defaultDeadline = new Date(state.startDate!.getTime() - 24 * 60 * 60 * 1000)
            const exampleDeadline = DateFormatter.formatDate(defaultDeadline).replace(' в ', ', ')

            await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\nПредоплата: ${state.advancePaymentAmount} грн\n\n${MESSAGES.CREATE_EVENT_ADVANCE_DEADLINE}\nПример: ${exampleDeadline}`, Markup.inlineKeyboard([[Markup.button.callback('💡 За сутки до начала', 'set_default_deadline')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          } else {
            // Если предоплаты нет, переходим к дополнительной информации
            state.step = 'what_to_bring'
            await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\n\nШаг 8/10 (опционально): Что взять с собой\nВведите информацию о том, что участникам нужно взять с собой, или пропустите этот шаг:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'skip_what_to_bring')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          }
          break

        case 'advance_payment_deadline':
          const deadlineDate = parseDateTime(ctx.message.text)
          if (!deadlineDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }

          // Проверяем что дата корректна
          const now = new Date()
          if (deadlineDate <= now) {
            await ctx.reply('Крайний срок оплаты должен быть в будущем. Попробуйте еще раз.')
            return
          }

          if (deadlineDate >= state.startDate!) {
            await ctx.reply('Крайний срок оплаты должен быть до начала встречи. Попробуйте еще раз.')
            return
          }

          state.advancePaymentDeadline = deadlineDate
          state.step = 'what_to_bring'

          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\nПредоплата: ${state.advancePaymentAmount} грн (до ${DateFormatter.formatDate(state.advancePaymentDeadline)})\n\nШаг 8/10 (опционально): Что взять с собой\nВведите информацию о том, что участникам нужно взять с собой, или пропустите этот шаг:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'skip_what_to_bring')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'what_to_bring':
          state.whatToBring = ctx.message.text
          state.step = 'how_to_get_there'

          await ctx.reply(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\n${state.advancePaymentAmount ? `Предоплата: ${state.advancePaymentAmount} грн (до ${DateFormatter.formatDate(state.advancePaymentDeadline!)})\n` : ''}${state.whatToBring ? `Что взять: ${state.whatToBring}\n` : ''}\n\nШаг 9/10 (опционально): Как добраться\nВведите информацию о том, как добраться до места встречи, или пропустите этот шаг:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'skip_how_to_get_there')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
          break

        case 'how_to_get_there':
          state.howToGetThere = ctx.message.text
          await createEvent(ctx, state, eventService)
          break
      }
    } catch (error) {
      console.error('Error in create event scene:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  scene.action('skip_image', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.createEventState as CreateEventSceneState
    state.imageFileId = null
    state.imageFileName = null
    state.step = 'full_payment'
    await ctx.editMessageText(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\n\nШаг 6/8: Введите стоимость участия в гривнах (только число):\nПример: 200`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_create')]]))
  })

  scene.action('no_advance_payment', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.createEventState as CreateEventSceneState
    state.advancePaymentAmount = null
    state.allowOnSitePayment = true
    state.step = 'what_to_bring'

    await ctx.editMessageText(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\n\nШаг 8/10 (опционально): Что взять с собой\nВведите информацию о том, что участникам нужно взять с собой, или пропустите этот шаг:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'skip_what_to_bring')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
  })

  scene.action('skip_what_to_bring', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.createEventState as CreateEventSceneState
    state.whatToBring = null
    state.step = 'how_to_get_there'

    await ctx.editMessageText(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\n${state.advancePaymentAmount ? `Предоплата: ${state.advancePaymentAmount} грн (до ${DateFormatter.formatDate(state.advancePaymentDeadline!)})\n` : ''}\n\nШаг 9/10 (опционально): Как добраться\nВведите информацию о том, как добраться до места встречи, или пропустите этот шаг:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'skip_how_to_get_there')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
  })

  scene.action('skip_how_to_get_there', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.createEventState as CreateEventSceneState
    state.howToGetThere = null

    await createEvent(ctx, state, eventService)
  })

  scene.action('set_default_deadline', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.createEventState as CreateEventSceneState

    // Устанавливаем дефолтный дедлайн (за сутки до начала)
    state.advancePaymentDeadline = new Date(state.startDate!.getTime() - 24 * 60 * 60 * 1000)
    state.step = 'what_to_bring'

    await ctx.editMessageText(`Название: ${state.title}\nНачало: ${DateFormatter.formatDate(state.startDate!)}\nОкончание: ${DateFormatter.formatDate(state.endDate!)}\nОписание: ${state.description}\nСтоимость: ${state.fullPaymentAmount} грн\nПредоплата: ${state.advancePaymentAmount} грн (до ${DateFormatter.formatDate(state.advancePaymentDeadline)})\n\nШаг 8/10 (опционально): Что взять с собой\nВведите информацию о том, что участникам нужно взять с собой, или пропустите этот шаг:`, Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'skip_what_to_bring')], [Markup.button.callback('❌ Отмена', 'cancel_create')]]))
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
      advancePaymentDeadline: state.advancePaymentDeadline,
      allowOnSitePayment: state.allowOnSitePayment!,
      location: null, // Можно добавить в будущем
      imageFileId: state.imageFileId,
      imageFileName: state.imageFileName,
      whatToBring: state.whatToBring,
      howToGetThere: state.howToGetThere,
      isPublished: false,
      isCancelled: false,
    }

    const event = await eventService.createEvent(eventData)

    await ctx.reply(
      `✅ Встреча успешно создана!\n\n` + `📅 ${event.title}\n` + `🕒 ${DateFormatter.formatDate(event.startDate)} - ${DateFormatter.formatDate(event.endDate)}\n` + `📝 ${event.description}\n` + `💰 Стоимость: ${event.fullPaymentAmount} грн\n` + `${event.advancePaymentAmount ? `💳 Предоплата: ${event.advancePaymentAmount} грн\n` : ''}` + `\n📝 Статус: Черновик (не опубликована)\n\n` + `Что дальше?`,
      Markup.inlineKeyboard([[Markup.button.callback('✅ Опубликовать сейчас', `publish_event_${event.id}`)], [Markup.button.callback('⏰ Отложенная публикация', `schedule_publish_${event.id}`)], [Markup.button.callback('✏️ Редактировать', `edit_event_${event.id}`)], [Markup.button.callback('📋 К списку встреч', 'admin_events')], [Markup.button.callback('🏠 Главное меню', 'main_menu')]])
    )

    return ctx.scene.leave()
  } catch (error) {
    console.error('Error creating event:', error)
    await ctx.reply(MESSAGES.ERROR_GENERAL)
    return ctx.scene.leave()
  }
}
