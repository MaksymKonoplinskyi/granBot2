import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { ReviewService } from '../services/review.service'
import { ReviewType, ReviewStatus } from '../entities/Review'
import { MESSAGES } from '../constants/messages'
import { DateFormatter } from '../utils/formatters'
import { replaceMessage } from '../utils/message-utils'

interface CreateReviewSceneState {
  step: 'type' | 'event_selection' | 'visibility' | 'anonymity' | 'content'
  reviewType?: ReviewType
  eventId?: number
  status?: ReviewStatus
  isAnonymous?: boolean
  availableEvents?: any[]
}

export const createCreateReviewScene = (reviewService: ReviewService) => {
  const scene = new Scenes.BaseScene<BotContext>('create-review')

  scene.enter(async ctx => {
    const state: CreateReviewSceneState = { step: 'type' }
    ctx.scene.state = state

    const messageText = 'О чем Вы хотите оставить отзыв?'
    const buttons = [[Markup.button.callback('🏢 О клубе', 'review_type_club')], [Markup.button.callback('📅 О встрече', 'review_type_event')], [Markup.button.callback('❌ Отмена', 'cancel_review')]]

    await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
  })

  // Выбор типа отзыва
  scene.action('review_type_club', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as CreateReviewSceneState
    state.reviewType = ReviewType.CLUB
    state.step = 'visibility'

    await showVisibilityStep(ctx)
  })

  scene.action('review_type_event', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as CreateReviewSceneState
    state.reviewType = ReviewType.EVENT
    state.step = 'event_selection'

    await showEventSelectionStep(ctx, reviewService)
  })

  // Выбор встречи
  scene.action(/^select_event_(\d+)$/, async ctx => {
    await ctx.answerCbQuery()
    const eventId = parseInt(ctx.match[1])
    const state = ctx.scene.state as CreateReviewSceneState
    state.eventId = eventId
    state.step = 'visibility'

    await showVisibilityStep(ctx)
  })

  // Выбор видимости
  scene.action('visibility_public', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as CreateReviewSceneState
    state.status = ReviewStatus.PUBLIC
    state.step = 'anonymity'

    await showAnonymityStep(ctx)
  })

  scene.action('visibility_private', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as CreateReviewSceneState
    state.status = ReviewStatus.PRIVATE
    state.isAnonymous = false
    state.step = 'content'

    await showContentStep(ctx)
  })

  // Выбор анонимности
  scene.action('anonymity_normal', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as CreateReviewSceneState
    state.isAnonymous = false
    state.step = 'content'

    await showContentStep(ctx)
  })

  scene.action('anonymity_anonymous', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as CreateReviewSceneState
    state.isAnonymous = true
    state.step = 'content'

    await showContentStep(ctx)
  })

  // Ввод текста отзыва
  scene.on('text', async ctx => {
    const state = ctx.scene.state as CreateReviewSceneState

    if (state.step !== 'content') {
      return
    }

    try {
      const content = ctx.message.text

      if (!content || content.trim().length === 0) {
        await ctx.reply('Пожалуйста, введите текст отзыва.')
        return
      }

      await reviewService.createReview({
        authorId: ctx.from!.id,
        type: state.reviewType!,
        eventId: state.eventId,
        content: content.trim(),
        status: state.status!,
        isAnonymous: state.isAnonymous!,
      })

      await replaceMessage(ctx, '✅ Отзыв успешно добавлен!', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))

      return ctx.scene.leave()
    } catch (error: any) {
      console.error('Error creating review:', error)
      await ctx.reply(error.message || 'Ошибка при создании отзыва')
    }
  })

  // Отмена
  scene.action('cancel_review', async ctx => {
    await ctx.answerCbQuery()
    await replaceMessage(ctx, 'Создание отзыва отменено.', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))
    return ctx.scene.leave()
  })

  // Возврат к отзывам
  scene.action('reviews', async ctx => {
    await ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  return scene
}

async function showEventSelectionStep(ctx: BotContext, reviewService: ReviewService): Promise<void> {
  try {
    const events = await reviewService.getUserAttendedEvents(ctx.from!.id)

    if (events.length === 0) {
      await replaceMessage(ctx, 'У вас нет прошедших встреч для отзыва.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'cancel_review')]]))
      return
    }

    const state = ctx.scene.state as CreateReviewSceneState
    state.availableEvents = events

    let messageText = 'Выберите встречу для отзыва:\n\n'

    const buttons: any[][] = []

    events.forEach(event => {
      const eventDate = DateFormatter.formatDate(event.startDate).split(',')[0] // Только дата
      const buttonText = `${event.title} (${eventDate})`
      buttons.push([Markup.button.callback(buttonText, `select_event_${event.id}`)])
    })

    buttons.push([Markup.button.callback('❌ Отмена', 'cancel_review')])

    await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
  } catch (error) {
    console.error('Error showing event selection:', error)
    await ctx.reply('Ошибка при загрузке встреч')
  }
}

async function showVisibilityStep(ctx: BotContext): Promise<void> {
  const messageText = `Выберите тип отзыва:

Публичный - обычный отзыв, который виден всем участникам и организаторам
Только для организаторов - виден только организаторам и админам клуба`

  const buttons = [[Markup.button.callback('🌍 Публичный', 'visibility_public')], [Markup.button.callback('🔒 Только для организаторов', 'visibility_private')], [Markup.button.callback('❌ Отмена', 'cancel_review')]]

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}

async function showAnonymityStep(ctx: BotContext): Promise<void> {
  const messageText = `Анонимный - означает что возле отзыва не будет отображаться ваш никнейм, имя и другая персональная информация`

  const buttons = [[Markup.button.callback('👤 Обычный', 'anonymity_normal')], [Markup.button.callback('🕶️ Анонимный', 'anonymity_anonymous')], [Markup.button.callback('❌ Отмена', 'cancel_review')]]

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}

async function showContentStep(ctx: BotContext): Promise<void> {
  const messageText = 'Ваш отзыв:\n\nНапишите текст вашего отзыва:'

  const buttons = [[Markup.button.callback('❌ Отмена', 'cancel_review')]]

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}
