import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { ReviewService } from '../services/review.service'
import { ReviewFormatter } from '../utils/review-formatters'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { replaceMessage } from '../utils/message-utils'

export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  async showReviews(ctx: BotContext, page: number = 1): Promise<void> {
    try {
      const isUserAdmin = isAdmin(ctx.from?.id)
      const reviewsData = await this.reviewService.getReviewsWithPagination(page, 5, isUserAdmin)

      let messageText = '💬 Отзывы:\n\n'

      if (reviewsData.reviews.length === 0) {
        messageText += 'Отзывов пока нет.'
      } else {
        const formattedReviews = reviewsData.reviews.map(review => (isUserAdmin ? ReviewFormatter.formatReviewForAdmin(review) : ReviewFormatter.formatReviewForUser(review))).join('\n\n─────────────────\n\n')

        messageText += formattedReviews
      }

      const buttons = await this.buildReviewsButtons(reviewsData, ctx.from?.id)

      await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing reviews:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  private async buildReviewsButtons(reviewsData: any, userId?: number): Promise<any[][]> {
    const buttons: any[][] = []

    // Кнопки пагинации
    if (reviewsData.totalPages > 1) {
      const paginationButtons = []

      if (reviewsData.hasPrev) {
        paginationButtons.push(Markup.button.callback('◀️ Назад', `reviews_page_${reviewsData.currentPage - 1}`))
      }

      paginationButtons.push(Markup.button.callback(`${reviewsData.currentPage}/${reviewsData.totalPages}`, 'reviews_page_current'))

      if (reviewsData.hasNext) {
        paginationButtons.push(Markup.button.callback('Вперед ▶️', `reviews_page_${reviewsData.currentPage + 1}`))
      }

      buttons.push(paginationButtons)
    }

    // Основные кнопки
    const mainButtons = [Markup.button.callback('✍️ Оставить отзыв', 'create_review')]

    // Проверяем, есть ли у пользователя отзывы
    if (userId) {
      const hasReviews = await this.reviewService.hasUserLeftAnyReview(userId)
      if (hasReviews) {
        mainButtons.push(Markup.button.callback('✏️ Редактировать отзыв', 'edit_review'))
      }
    }

    buttons.push(mainButtons)

    // Кнопка скрытия отзывов для админов
    if (isAdmin(userId)) {
      buttons.push([Markup.button.callback('🙈 Скрыть отзыв', 'hide_review')])
    }

    // Кнопка возврата в главное меню
    buttons.push([Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')])

    return buttons
  }

  async showHideReviewsList(ctx: BotContext): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
        return
      }

      const reviewsData = await this.reviewService.getReviewsWithPagination(1, 10, true)

      if (reviewsData.reviews.length === 0) {
        await replaceMessage(ctx, 'Нет отзывов для скрытия.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к отзывам', 'reviews')]]))
        return
      }

      let messageText = '🙈 Выберите отзыв для скрытия:\n\n'

      const buttons: any[][] = []

      reviewsData.reviews.forEach((review, index) => {
        const shortContent = review.content.length > 50 ? review.content.substring(0, 50) + '...' : review.content

        const authorName = review.author.firstName + (review.author.lastName ? ` ${review.author.lastName}` : '')
        const buttonText = `${index + 1}. ${authorName}: "${shortContent}"`

        buttons.push([Markup.button.callback(buttonText, `hide_review_${review.id}`)])
      })

      buttons.push([Markup.button.callback('◀️ Назад к отзывам', 'reviews')])

      await replaceMessage(ctx, messageText, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing hide reviews list:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async hideReview(ctx: BotContext, reviewId: number): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
        return
      }

      await this.reviewService.hideReview(reviewId)
      await ctx.answerCbQuery('Отзыв скрыт')

      // Возвращаемся к списку отзывов
      await this.showReviews(ctx, 1)
    } catch (error) {
      console.error('Error hiding review:', error)
      await ctx.answerCbQuery('Ошибка при скрытии отзыва')
    }
  }

  async startCreateReview(ctx: BotContext): Promise<void> {
    try {
      await ctx.answerCbQuery()
      await ctx.scene.enter('create-review')
    } catch (error) {
      console.error('Error starting create review:', error)
      await ctx.answerCbQuery('Ошибка при создании отзыва')
    }
  }

  async startEditReview(ctx: BotContext): Promise<void> {
    try {
      await ctx.answerCbQuery()
      await ctx.scene.enter('edit-review')
    } catch (error) {
      console.error('Error starting edit review:', error)
      await ctx.answerCbQuery('Ошибка при редактировании отзыва')
    }
  }
}
