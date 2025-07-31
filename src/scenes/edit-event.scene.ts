import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { MESSAGES } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { DateFormatter } from '../utils/formatters'
import { showEventsManagementMenu } from '../utils/admin-menus'

interface EditEventSceneState {
  eventId: number
  editingField?: 'title' | 'start_date' | 'end_date' | 'description' | 'full_payment' | 'advance_payment' | 'advance_payment_deadline' | 'image' | 'scheduled_publish'
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

export const createEditEventScene = (eventService: EventService) => {
  const scene = new Scenes.BaseScene<BotContext>('edit-event')

  scene.enter(async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      // Получаем eventId из параметров входа в сцену
      const eventId = (ctx.scene as any).state?.eventId
      if (!eventId) {
        await ctx.reply('Ошибка: ID события не найден')
        return ctx.scene.leave()
      }

      // Инициализируем состояние сцены
      ctx.session = ctx.session || {}
      ;(ctx.session as any).editEventState = {
        eventId,
      }

      await showEventEditMenu(ctx, eventService, eventId)
    } catch (error) {
      console.error('Error entering edit event scene:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  // Обработка изображений
  scene.on('photo', async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      const state = (ctx.session as any)?.editEventState as EditEventSceneState

      if (!state || state.editingField !== 'image') {
        await ctx.reply('Сейчас не время для загрузки изображения. Сначала выберите "Редактировать изображение" из меню.')
        return
      }

      // Получаем самое большое изображение из массива
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      const updateData = {
        imageFileId: photo.file_id,
        imageFileName: `event_image_${Date.now()}.jpg`,
      }

      await eventService.updateEvent(state.eventId, updateData)

      // Сбрасываем состояние редактирования
      state.editingField = undefined

      await ctx.reply('✅ Изображение обновлено!')
      await showEventEditMenu(ctx, eventService, state.eventId)
    } catch (error) {
      console.error('Error updating event image:', error)
      await ctx.reply('Ошибка при обновлении изображения. Попробуйте еще раз.')
    }
  })

  scene.on('text', async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      const state = (ctx.session as any)?.editEventState as EditEventSceneState

      if (!state.editingField) {
        await ctx.reply('Выберите поле для редактирования из меню')
        return
      }

      const event = await eventService.getEventById(state.eventId)
      if (!event) {
        await ctx.reply('Событие не найдено')
        return ctx.scene.leave()
      }

      let updateData: any = {}

      switch (state.editingField) {
        case 'title':
          updateData.title = ctx.message.text
          break

        case 'start_date':
          const startDate = parseDateTime(ctx.message.text)
          if (!startDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }
          updateData.startDate = startDate
          break

        case 'end_date':
          const endDate = parseDateTime(ctx.message.text)
          if (!endDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }
          updateData.endDate = endDate
          break

        case 'description':
          updateData.description = ctx.message.text
          break

        case 'full_payment':
          const fullPayment = parseFloat(ctx.message.text)
          if (isNaN(fullPayment) || fullPayment < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число)')
            return
          }
          updateData.fullPaymentAmount = fullPayment
          break

        case 'advance_payment':
          const advancePayment = parseFloat(ctx.message.text)
          if (isNaN(advancePayment) || advancePayment < 0) {
            await ctx.reply('Пожалуйста, введите корректную сумму (положительное число или 0)')
            return
          }
          updateData.advancePaymentAmount = advancePayment === 0 ? null : advancePayment
          if (advancePayment > 0) {
            // Устанавливаем дедлайн за сутки до начала события (если его еще нет)
            if (!event.advancePaymentDeadline) {
              updateData.advancePaymentDeadline = new Date(event.startDate.getTime() - 24 * 60 * 60 * 1000)
            }
          } else {
            updateData.advancePaymentDeadline = null
          }
          break

        case 'advance_payment_deadline':
          const deadlineDate = parseDateTime(ctx.message.text)
          if (!deadlineDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }

          // Проверяем что дата корректна
          const nowDeadline = new Date()
          if (deadlineDate <= nowDeadline) {
            await ctx.reply('Крайний срок оплаты должен быть в будущем. Попробуйте еще раз.')
            return
          }

          if (deadlineDate >= event.startDate) {
            await ctx.reply('Крайний срок оплаты должен быть до начала встречи. Попробуйте еще раз.')
            return
          }

          updateData.advancePaymentDeadline = deadlineDate
          break

        case 'scheduled_publish':
          const scheduledDate = parseDateTime(ctx.message.text)
          if (!scheduledDate) {
            await ctx.reply('Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }

          const nowScheduled = new Date()
          if (scheduledDate <= nowScheduled) {
            await ctx.reply('Дата публикации должна быть в будущем. Попробуйте еще раз.')
            return
          }

          try {
            await eventService.scheduleEventPublish(state.eventId, scheduledDate)
            await ctx.reply(`✅ Отложенная публикация настроена на ${DateFormatter.formatDate(scheduledDate)}!`)
          } catch (error) {
            console.error('Error scheduling publish:', error)
            if (error instanceof Error && error.message === 'Event is already published') {
              await ctx.reply('❌ Встреча уже опубликована. Нельзя настроить отложенную публикацию.')
            } else {
              await ctx.reply('❌ Ошибка при настройке отложенной публикации.')
            }
          }
          break
      }

      await eventService.updateEvent(state.eventId, updateData)
      await ctx.reply('✅ Поле успешно обновлено!')

      // Сбрасываем поле редактирования и показываем меню
      state.editingField = undefined
      await showEventEditMenu(ctx, eventService, state.eventId)
    } catch (error) {
      console.error('Error updating event field:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  })

  scene.action(/^edit_field_(.+)$/, async ctx => {
    await ctx.answerCbQuery()

    const field = ctx.match[1] as EditEventSceneState['editingField']
    const state = (ctx.session as any)?.editEventState as EditEventSceneState

    if (!state) {
      await ctx.reply('Ошибка состояния сцены')
      return ctx.scene.leave()
    }

    const event = await eventService.getEventById(state.eventId)
    if (!event) {
      await ctx.reply('Событие не найдено')
      return ctx.scene.leave()
    }

    state.editingField = field

    switch (field) {
      case 'title':
        await ctx.reply(`Текущее название: ${event.title}\n\nВведите новое название:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'start_date':
        await ctx.reply(`Текущая дата начала: ${DateFormatter.formatDate(event.startDate)}\n\nВведите новую дату в формате ДД.ММ.ГГГГ, ЧЧ:ММ:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'end_date':
        await ctx.reply(`Текущая дата окончания: ${DateFormatter.formatDate(event.endDate)}\n\nВведите новую дату в формате ДД.ММ.ГГГГ, ЧЧ:ММ:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'description':
        await ctx.reply(`Текущее описание: ${event.description}\n\nВведите новое описание:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'full_payment':
        await ctx.reply(`Текущая стоимость: ${event.fullPaymentAmount} грн\n\nВведите новую стоимость (только число):`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'advance_payment':
        await ctx.reply(`Текущая предоплата: ${event.advancePaymentAmount ? `${event.advancePaymentAmount} грн` : 'Не установлена'}\n\nВведите новую стоимость предоплаты (только число или 0 для отключения):`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'advance_payment_deadline':
        const currentDeadline = event.advancePaymentDeadline ? DateFormatter.formatDate(event.advancePaymentDeadline) : 'Не установлен'
        const defaultDeadline = new Date(event.startDate.getTime() - 24 * 60 * 60 * 1000)
        const exampleDeadline = DateFormatter.formatDate(defaultDeadline).replace(' в ', ', ')

        await ctx.reply(`Текущий крайний срок: ${currentDeadline}\n\nВведите новый крайний срок оплаты заранее (ДД.ММ.ГГГГ, ЧЧ:ММ):\nПример: ${exampleDeadline}`, Markup.inlineKeyboard([[Markup.button.callback('💡 За сутки до начала', 'set_default_edit_deadline')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
        break

      case 'image':
        const imageStatus = event.imageFileId ? '🖼 Изображение загружено' : '📷 Изображение отсутствует'
        const buttons = [[Markup.button.callback('📷 Загрузить новое изображение', 'upload_new_image')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]

        if (event.imageFileId) {
          buttons.splice(1, 0, [Markup.button.callback('🗑 Удалить изображение', 'delete_image')])
        }

        await ctx.reply(`${imageStatus}\n\nВыберите действие:`, Markup.inlineKeyboard(buttons))
        break

      case 'scheduled_publish':
        const currentScheduled = event.scheduledPublishDate ? `⏰ Запланировано на: ${DateFormatter.formatDate(event.scheduledPublishDate)}` : '❌ Отложенная публикация не задана'

        const scheduleButtons = [[Markup.button.callback('📅 Задать дату и время', 'set_schedule_time')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]

        if (event.scheduledPublishDate) {
          scheduleButtons.splice(1, 0, [Markup.button.callback('🗑 Отменить отложенную публикацию', 'cancel_scheduled_publish')])
        }

        await ctx.reply(`${currentScheduled}\n\nВыберите действие:`, Markup.inlineKeyboard(scheduleButtons))
        break
    }
  })

  scene.action('toggle_publish', async ctx => {
    await ctx.answerCbQuery()

    const state = (ctx.session as any)?.editEventState as EditEventSceneState
    const event = await eventService.getEventById(state.eventId)

    if (!event) {
      await ctx.reply('Событие не найдено')
      return ctx.scene.leave()
    }

    if (!event.isPublished) {
      const isValid = await eventService.validateEventForPublish(state.eventId)
      if (!isValid) {
        await ctx.answerCbQuery('Не все поля заполнены. Заполните все обязательные поля перед публикацией.')
        return
      }
      await eventService.publishEvent(state.eventId)
      await ctx.reply('✅ Событие опубликовано!')
    } else {
      await eventService.updateEvent(state.eventId, { isPublished: false })
      await ctx.reply('📝 Событие снято с публикации')
    }

    await showEventEditMenu(ctx, eventService, state.eventId)
  })

  scene.action('set_schedule_time', async ctx => {
    await ctx.answerCbQuery()
    await ctx.editMessageText(`📅 Введите дату и время для отложенной публикации в формате ДД.ММ.ГГГГ, ЧЧ:ММ\nПример: ${DateFormatter.generateDateTimeExample()}`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
  })

  scene.action('cancel_scheduled_publish', async ctx => {
    await ctx.answerCbQuery()

    try {
      const state = (ctx.session as any)?.editEventState as EditEventSceneState
      await eventService.cancelScheduledPublish(state.eventId)

      state.editingField = undefined
      await ctx.editMessageText('🗑 Отложенная публикация отменена!')
      setTimeout(() => {
        showEventEditMenu(ctx, eventService, state.eventId)
      }, 1000)
    } catch (error) {
      console.error('Error canceling scheduled publish:', error)
      await ctx.reply('Ошибка при отмене отложенной публикации')
    }
  })

  scene.action('upload_new_image', async ctx => {
    await ctx.answerCbQuery()
    await ctx.editMessageText('📷 Отправьте новое изображение для встречи:', Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
  })

  scene.action('delete_image', async ctx => {
    await ctx.answerCbQuery()

    try {
      const state = (ctx.session as any)?.editEventState as EditEventSceneState

      await eventService.updateEvent(state.eventId, {
        imageFileId: null,
        imageFileName: null,
      })

      state.editingField = undefined
      await ctx.editMessageText('🗑 Изображение удалено!')
      setTimeout(() => {
        showEventEditMenu(ctx, eventService, state.eventId)
      }, 1000)
    } catch (error) {
      console.error('Error deleting image:', error)
      await ctx.reply('Ошибка при удалении изображения')
    }
  })

  scene.action('cancel_edit', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.editEventState as EditEventSceneState
    state.editingField = undefined
    await showEventEditMenu(ctx, eventService, state.eventId)
  })

  scene.action('set_default_edit_deadline', async ctx => {
    await ctx.answerCbQuery()
    const state = (ctx.session as any)?.editEventState as EditEventSceneState

    const event = await eventService.getEventById(state.eventId)
    if (!event) {
      await ctx.reply('Событие не найдено')
      return ctx.scene.leave()
    }

    // Устанавливаем дефолтный дедлайн (за сутки до начала)
    const defaultDeadline = new Date(event.startDate.getTime() - 24 * 60 * 60 * 1000)

    try {
      await eventService.updateEvent(state.eventId, { advancePaymentDeadline: defaultDeadline })
      await ctx.editMessageText('✅ Крайний срок установлен за сутки до начала встречи')

      state.editingField = undefined
      setTimeout(async () => {
        await showEventEditMenu(ctx, eventService, state.eventId)
      }, 1000)
    } catch (error) {
      console.error('Error updating deadline:', error)
      await ctx.reply('Ошибка при обновлении крайнего срока')
    }
  })

  scene.action('back_to_events', async ctx => {
    await ctx.answerCbQuery()
    ctx.scene.leave()

    // Показываем меню событий администратора
    await showEventsManagementMenu(ctx)
  })

  return scene
}

async function showEventEditMenu(ctx: BotContext, eventService: EventService, eventId: number) {
  try {
    const event = await eventService.getEventDetails(eventId)
    if (!event) {
      await ctx.reply('Событие не найдено')
      return ctx.scene.leave()
    }

    const imageStatus = event.imageFileId ? '🖼 Загружено' : '📷 Отсутствует'
    const scheduledStatus = event.scheduledPublishDate ? `⏰ ${DateFormatter.formatDate(event.scheduledPublishDate)}` : '❌ Не задана'

    const deadlineStatus = event.advancePaymentDeadline ? DateFormatter.formatDate(event.advancePaymentDeadline) : 'Не установлен'
    const eventText = `📝 Редактирование встречи\n\n` + `📅 Название: ${event.title}\n` + `🕒 Начало: ${DateFormatter.formatDate(event.startDate)}\n` + `🕕 Окончание: ${DateFormatter.formatDate(event.endDate)}\n` + `📄 Описание: ${event.description}\n` + `🖼 Изображение: ${imageStatus}\n` + `💰 Стоимость: ${event.fullPaymentAmount} грн\n` + `💳 Предоплата: ${event.advancePaymentAmount ? `${event.advancePaymentAmount} грн` : 'Не установлена'}\n` + (event.advancePaymentAmount ? `⏰ Крайний срок предоплаты: ${deadlineStatus}\n` : '') + `👥 Участников: ${event.participantCount}\n` + `📊 Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n` + `⏰ Отложенная публикация: ${scheduledStatus}\n\n` + `Выберите поле для редактирования:`

    const buttons = [[Markup.button.callback('✏️ Название', 'edit_field_title')], [Markup.button.callback('🕒 Дата начала', 'edit_field_start_date')], [Markup.button.callback('🕕 Дата окончания', 'edit_field_end_date')], [Markup.button.callback('📄 Описание', 'edit_field_description')], [Markup.button.callback('🖼 Изображение', 'edit_field_image')], [Markup.button.callback('💰 Стоимость', 'edit_field_full_payment')], [Markup.button.callback('💳 Предоплата', 'edit_field_advance_payment')]]

    // Добавляем кнопку для редактирования крайнего срока только если есть предоплата
    if (event.advancePaymentAmount) {
      buttons.push([Markup.button.callback('⏰ Крайний срок предоплаты', 'edit_field_advance_payment_deadline')])
    }

    buttons.push([Markup.button.callback('👥 Список участников', `view_participants_${eventId}`)])

    // Добавляем кнопки публикации только если встреча не опубликована
    if (!event.isPublished) {
      buttons.push([Markup.button.callback('⏰ Отложенная публикация', 'edit_field_scheduled_publish')])
      buttons.push([Markup.button.callback('✅ Опубликовать сейчас', 'toggle_publish')])
    } else {
      buttons.push([Markup.button.callback('📝 Снять с публикации', 'toggle_publish')])
    }

    buttons.push([Markup.button.callback('◀️ К списку встреч', 'back_to_events')])

    await ctx.editMessageText(eventText, Markup.inlineKeyboard(buttons))
  } catch (error) {
    console.error('Error showing event edit menu:', error)
    await ctx.reply('Ошибка при загрузке данных встречи')
    return ctx.scene.leave()
  }
}
