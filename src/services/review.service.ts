import { ReviewRepository } from '../repositories/review.repository'
import { EventRepository } from '../repositories/event.repository'
import { UserRepository } from '../repositories/user.repository'
import { CreateReviewDto, UpdateReviewDto, ReviewListDto } from '../dto/review.dto'
import { Review, ReviewType } from '../entities/Review'
import { EventDetailsDto } from '../dto/event.dto'
import { AttendanceStatus } from '../utils/formatters'

export class ReviewService {
  constructor(private reviewRepository: ReviewRepository, private eventRepository: EventRepository, private userRepository: UserRepository) {}

  async createReview(reviewData: CreateReviewDto): Promise<Review> {
    // Проверяем, что пользователь существует в базе данных
    const user = await this.userRepository.findByTelegramId(reviewData.authorId)
    if (!user) {
      throw new Error('Пользователь не найден в базе данных')
    }

    // Если отзыв о встрече, проверяем что пользователь участвовал в ней
    if (reviewData.type === ReviewType.EVENT && reviewData.eventId) {
      const userAttendedEvents = await this.eventRepository.getUserAttendedEvents(user.id)
      const attendedEvent = userAttendedEvents.find(event => event.id === reviewData.eventId)

      if (!attendedEvent) {
        throw new Error('Вы можете оставлять отзывы только о встречах, в которых участвовали')
      }
    }

    return await this.reviewRepository.createReview(reviewData, user)
  }

  async updateReview(reviewId: number, updateData: UpdateReviewDto, telegramId: number): Promise<Review> {
    const user = await this.userRepository.findByTelegramId(telegramId)
    if (!user) {
      throw new Error('Пользователь не найден')
    }

    const review = await this.reviewRepository.getReviewById(reviewId)

    if (!review) {
      throw new Error('Отзыв не найден')
    }

    if (review.author.id !== user.id) {
      throw new Error('Вы можете редактировать только свои отзывы')
    }

    const updatedReview = await this.reviewRepository.updateReview(reviewId, updateData)

    if (!updatedReview) {
      throw new Error('Ошибка при обновлении отзыва')
    }

    return updatedReview
  }

  async deleteReview(reviewId: number, telegramId: number): Promise<void> {
    const user = await this.userRepository.findByTelegramId(telegramId)
    if (!user) {
      throw new Error('Пользователь не найден')
    }

    const review = await this.reviewRepository.getReviewById(reviewId)

    if (!review) {
      throw new Error('Отзыв не найден')
    }

    if (review.author.id !== user.id) {
      throw new Error('Вы можете удалять только свои отзывы')
    }

    await this.reviewRepository.deleteReview(reviewId)
  }

  async getReviewsWithPagination(page: number, limit: number, isAdmin: boolean = false): Promise<ReviewListDto> {
    return await this.reviewRepository.getReviewsWithPagination(page, limit, isAdmin)
  }

  async getUserReviews(telegramId: number): Promise<Review[]> {
    const user = await this.userRepository.findByTelegramId(telegramId)
    if (!user) {
      return []
    }
    return await this.reviewRepository.getReviewsByAuthor(user.id)
  }

  async getReviewById(reviewId: number): Promise<Review | null> {
    return await this.reviewRepository.getReviewById(reviewId)
  }

  async hasUserLeftAnyReview(telegramId: number): Promise<boolean> {
    const user = await this.userRepository.findByTelegramId(telegramId)
    if (!user) {
      return false
    }
    return await this.reviewRepository.hasUserLeftAnyReview(user.id)
  }

  async toggleReviewVisibility(reviewId: number): Promise<string> {
    return await this.reviewRepository.toggleReviewVisibility(reviewId)
  }

  async getUserAttendedEvents(telegramId: number): Promise<EventDetailsDto[]> {
    // Сначала находим пользователя по telegramId
    const user = await this.userRepository.findByTelegramId(telegramId)
    if (!user) {
      return []
    }

    // Получаем прошедшие встречи, где пользователь участвовал
    const events = await this.eventRepository.getUserAttendedEvents(user.id)

    return events.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description || '',
      startDate: event.startDate,
      endDate: event.endDate,
      imageFileId: event.imageFileId || null,
      fullPaymentAmount: event.fullPaymentAmount || 0,
      advancePaymentAmount: event.advancePaymentAmount || null,
      advancePaymentDeadline: event.advancePaymentDeadline || null,
      whatToBring: event.whatToBring || null,
      howToGetThere: event.howToGetThere || null,
      isPublished: event.isPublished,
      isCancelled: event.isCancelled,
      scheduledPublishDate: event.scheduledPublishDate,
      allowOnSitePayment: event.allowOnSitePayment || true,
      participantCount: 0,
      participants: [],
      userParticipation: null,
    }))
  }
}
