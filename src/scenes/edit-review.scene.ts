import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { ReviewService } from '../services/review.service'
import { ReviewStatus } from '../entities/Review'
import { MESSAGES } from '../constants/messages'
import { ReviewFormatter } from '../utils/review-formatters'
import { replaceMessage } from '../utils/message-utils'

interface EditReviewSceneState {
  step: 'selection' | 'edit_type' | 'edit_content' | 'edit_visibility' | 'edit_anonymity' | 'delete_confirmation'
  selectedReviewId?: number
  userReviews?: any[]
  editField?: 'content' | 'visibility'
  newStatus?: ReviewStatus
  newIsAnonymous?: boolean
  reviewToDelete?: any
}

export const createEditReviewScene = (reviewService: ReviewService) => {
  const scene = new Scenes.BaseScene<BotContext>('edit-review')

  scene.enter(async ctx => {
    try {
      const userReviews = await reviewService.getUserReviews(ctx.from!.id)

      if (userReviews.length === 0) {
        await replaceMessage(ctx, 'У вас нет отзывов для редактирования.', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))
        return ctx.scene.leave()
      }

      const state: EditReviewSceneState = {
        step: 'selection',
        userReviews,
      }
      ctx.scene.state = state

      await showReviewSelection(ctx, userReviews)
    } catch (error) {
      console.error('Error entering edit review scene:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  // Выбор отзыва для редактирования
  scene.action(/^edit_review_(\d+)$/, async ctx => {
    await ctx.answerCbQuery()
    const reviewId = parseInt(ctx.match[1])
    const state = ctx.scene.state as EditReviewSceneState
    state.selectedReviewId = reviewId
    state.step = 'edit_type'

    await showEditTypeSelection(ctx)
  })

  // Выбор типа редактирования
  scene.action('edit_content', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.editField = 'content'
    state.step = 'edit_content'

    await showContentEditStep(ctx, reviewService)
  })

  scene.action('edit_visibility', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.editField = 'visibility'
    state.step = 'edit_visibility'

    await showVisibilityEditStep(ctx, reviewService)
  })

  // Редактирование видимости
  scene.action('new_visibility_public', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.newStatus = ReviewStatus.PUBLIC
    state.step = 'edit_anonymity'

    await showAnonymityEditStep(ctx)
  })

  scene.action('new_visibility_private', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.newStatus = ReviewStatus.PRIVATE
    state.newIsAnonymous = false

    await saveVisibilityChanges(ctx, reviewService)
  })

  // Редактирование анонимности
  scene.action('new_anonymity_normal', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.newIsAnonymous = false

    await saveVisibilityChanges(ctx, reviewService)
  })

  scene.action('new_anonymity_anonymous', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.newIsAnonymous = true

    await saveVisibilityChanges(ctx, reviewService)
  })

  // Удаление отзыва
  scene.action('delete_review', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState

    // Находим отзыв в списке пользователя
    const reviewToDelete = state.userReviews?.find(review => review.id === state.selectedReviewId)
    if (!reviewToDelete) {
      await ctx.reply('Отзыв не найден')
      return
    }

    state.reviewToDelete = reviewToDelete
    state.step = 'delete_confirmation'

    await showDeleteConfirmation(ctx, reviewToDelete)
  })

  // Подтверждение удаления отзыва
  scene.action('confirm_delete', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState

    try {
      if (!state.reviewToDelete) {
        await ctx.reply('Ошибка: отзыв для удаления не найден')
        return
      }

      await reviewService.deleteReview(state.reviewToDelete.id, ctx.from!.id)

      await replaceMessage(ctx, '✅ Отзыв успешно удален!', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))

      return ctx.scene.leave()
    } catch (error: any) {
      console.error('Error deleting review:', error)
      await ctx.reply(error.message || 'Ошибка при удалении отзыва')
    }
  })

  // Отмена удаления отзыва
  scene.action('cancel_delete', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.step = 'edit_type'

    await showEditTypeSelection(ctx)
  })

  // Редактирование текста
  scene.on('text', async ctx => {
    const state = ctx.scene.state as EditReviewSceneState

    if (state.step !== 'edit_content') {
      return
    }

    try {
      const newContent = ctx.message.text

      if (!newContent || newContent.trim().length === 0) {
        await ctx.reply('Пожалуйста, введите новый текст отзыва.')
        return
      }

      await reviewService.updateReview(state.selectedReviewId!, { content: newContent.trim() }, ctx.from!.id)

      await replaceMessage(ctx, '✅ Отзыв успешно обновлен!', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))

      return ctx.scene.leave()
    } catch (error: any) {
      console.error('Error updating review content:', error)
      await ctx.reply(error.message || 'Ошибка при обновлении отзыва')
    }
  })

  // Отмена и возврат
  scene.action('cancel_edit', async ctx => {
    await ctx.answerCbQuery()
    await replaceMessage(ctx, 'Редактирование отменено.', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))
    return ctx.scene.leave()
  })

  scene.action('back_to_selection', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.step = 'selection'

    await showReviewSelection(ctx, state.userReviews!)
  })

  scene.action('back_to_edit_type', async ctx => {
    await ctx.answerCbQuery()
    const state = ctx.scene.state as EditReviewSceneState
    state.step = 'edit_type'

    await showEditTypeSelection(ctx)
  })

  scene.action('reviews', async ctx => {
    await ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  return scene
}

async function showReviewSelection(ctx: BotContext, userReviews: any[]): Promise<void> {
  let messageText = 'Выберите отзыв для редактирования:\n\n'

  const buttons: any[][] = []

  userReviews.forEach((review, index) => {
    const shortContent = review.content.length > 50 ? review.content.substring(0, 50) + '...' : review.content

    let reviewInfo = ''
    if (review.type === 'club') {
      reviewInfo = 'О клубе'
    } else if (review.event) {
      reviewInfo = `О встрече "${review.event.title}"`
    }

    const buttonText = `${index + 1}. ${reviewInfo}: "${shortContent}"`
    buttons.push([Markup.button.callback(buttonText, `edit_review_${review.id}`)])
  })

  buttons.push([Markup.button.callback('❌ Отмена', 'cancel_edit')])

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}

async function showEditTypeSelection(ctx: BotContext): Promise<void> {
  const messageText = 'Что вы хотите изменить?'

  const buttons = [[Markup.button.callback('📝 Текст отзыва', 'edit_content')], [Markup.button.callback('👁️ Видимость отзыва', 'edit_visibility')], [Markup.button.callback('🗑️ Удалить отзыв', 'delete_review')], [Markup.button.callback('◀️ Назад', 'back_to_selection')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}

async function showContentEditStep(ctx: BotContext, reviewService: ReviewService): Promise<void> {
  try {
    const state = ctx.scene.state as EditReviewSceneState
    const review = await reviewService.getReviewById(state.selectedReviewId!)

    if (!review) {
      await ctx.reply('Отзыв не найден')
      return
    }

    const messageText = `Текущий текст отзыва:\n\n"${review.content}"\n\nВведите новый текст:`

    const buttons = [[Markup.button.callback('◀️ Назад', 'back_to_edit_type')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]

    await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
  } catch (error) {
    console.error('Error showing content edit step:', error)
    await ctx.reply('Ошибка при загрузке отзыва')
  }
}

async function showVisibilityEditStep(ctx: BotContext, reviewService: ReviewService): Promise<void> {
  try {
    const state = ctx.scene.state as EditReviewSceneState
    const review = await reviewService.getReviewById(state.selectedReviewId!)

    if (!review) {
      await ctx.reply('Отзыв не найден')
      return
    }

    const currentStatus = review.status === ReviewStatus.PUBLIC ? 'Публичный' : 'Только для организаторов'

    const messageText = `Текущая видимость: ${currentStatus}\n\nВыберите новую видимость:`

    const buttons = [[Markup.button.callback('🌍 Публичный', 'new_visibility_public')], [Markup.button.callback('🔒 Только для организаторов', 'new_visibility_private')], [Markup.button.callback('◀️ Назад', 'back_to_edit_type')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]

    await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
  } catch (error) {
    console.error('Error showing visibility edit step:', error)
    await ctx.reply('Ошибка при загрузке отзыва')
  }
}

async function showAnonymityEditStep(ctx: BotContext): Promise<void> {
  const messageText = 'Выберите режим отображения:'

  const buttons = [[Markup.button.callback('👤 Обычный', 'new_anonymity_normal')], [Markup.button.callback('🕶️ Анонимный', 'new_anonymity_anonymous')], [Markup.button.callback('◀️ Назад', 'back_to_edit_type')], [Markup.button.callback('❌ Отмена', 'cancel_edit')]]

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}

async function saveVisibilityChanges(ctx: BotContext, reviewService: ReviewService): Promise<void> {
  try {
    const state = ctx.scene.state as EditReviewSceneState

    await reviewService.updateReview(
      state.selectedReviewId!,
      {
        status: state.newStatus!,
        isAnonymous: state.newIsAnonymous!,
      },
      ctx.from!.id
    )

    await replaceMessage(ctx, '✅ Настройки отзыва успешно обновлены!', Markup.inlineKeyboard([[Markup.button.callback('◀️ К отзывам', 'reviews')]]))

    return ctx.scene.leave()
  } catch (error: any) {
    console.error('Error saving visibility changes:', error)
    await ctx.reply(error.message || 'Ошибка при обновлении настроек отзыва')
  }
}

async function showDeleteConfirmation(ctx: BotContext, reviewToDelete: any): Promise<void> {
  const shortContent = reviewToDelete.content.length > 100 ? reviewToDelete.content.substring(0, 100) + '...' : reviewToDelete.content

  let reviewInfo = ''
  if (reviewToDelete.type === 'club') {
    reviewInfo = 'О клубе'
  } else if (reviewToDelete.event) {
    reviewInfo = `О встрече "${reviewToDelete.event.title}"`
  }

  const messageText = `⚠️ Вы уверены, что хотите удалить отзыв?\n\n${reviewInfo}:\n"${shortContent}"\n\n❗ Это действие нельзя отменить!`

  const buttons = [[Markup.button.callback('✅ Да, удалить', 'confirm_delete'), Markup.button.callback('❌ Отмена', 'cancel_delete')]]

  await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
}
