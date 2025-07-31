import { DataSource, Repository } from 'typeorm'
import { Review, ReviewType, ReviewStatus } from '../entities/Review'
import { CreateReviewDto, UpdateReviewDto, ReviewDetailsDto, ReviewListDto } from '../dto/review.dto'

export class ReviewRepository {
  private reviewRepository: Repository<Review>

  constructor(private dataSource: DataSource) {
    this.reviewRepository = this.dataSource.getRepository(Review)
  }

  async createReview(reviewData: CreateReviewDto, author: any): Promise<Review> {
    const review = this.reviewRepository.create({
      author: author,
      type: reviewData.type,
      event: reviewData.eventId ? { id: reviewData.eventId } : undefined,
      content: reviewData.content,
      status: reviewData.status,
      isAnonymous: reviewData.isAnonymous,
    })

    return await this.reviewRepository.save(review)
  }

  async updateReview(reviewId: number, updateData: UpdateReviewDto): Promise<Review | null> {
    await this.reviewRepository.update(reviewId, updateData)
    return await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['author', 'event'],
    })
  }

  async deleteReview(reviewId: number): Promise<void> {
    await this.reviewRepository.delete(reviewId)
  }

  async getReviewById(reviewId: number): Promise<Review | null> {
    return await this.reviewRepository.findOne({
      where: { id: reviewId },
      relations: ['author', 'event'],
    })
  }

  async getReviewsByAuthor(authorId: number): Promise<Review[]> {
    return await this.reviewRepository.find({
      where: { author: { id: authorId } },
      relations: ['author', 'event'],
      order: { createdAt: 'DESC' },
    })
  }

  async getReviewsWithPagination(page: number, limit: number, isAdmin: boolean = false): Promise<ReviewListDto> {
    const offset = (page - 1) * limit

    let whereConditions: any = {}

    if (!isAdmin) {
      // Для обычных пользователей показываем только публичные и не скрытые отзывы
      whereConditions = {
        status: ReviewStatus.PUBLIC,
      }
    }
    // Для админов показываем все отзывы

    const [reviews, totalCount] = await this.reviewRepository.findAndCount({
      where: whereConditions,
      relations: ['author', 'event'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })

    const totalPages = Math.ceil(totalCount / limit)

    return {
      reviews: reviews.map(review => this.mapToDetailsDto(review)),
      totalCount,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    }
  }

  async hasUserLeftAnyReview(userId: number): Promise<boolean> {
    const count = await this.reviewRepository.count({
      where: { author: { id: userId } },
    })
    return count > 0
  }

  async toggleReviewVisibility(reviewId: number): Promise<string> {
    const review = await this.reviewRepository.findOne({ where: { id: reviewId } })
    if (!review) {
      throw new Error('Отзыв не найден')
    }

    // Проверяем, что отзыв можно переключать (только публичные и скрытые)
    if (review.status === ReviewStatus.PRIVATE) {
      throw new Error('Нельзя изменить видимость приватного отзыва')
    }

    const newStatus = review.status === ReviewStatus.HIDDEN ? ReviewStatus.PUBLIC : ReviewStatus.HIDDEN
    await this.reviewRepository.update(reviewId, { status: newStatus })

    return newStatus
  }

  private mapToDetailsDto(review: Review): ReviewDetailsDto {
    return {
      id: review.id,
      author: {
        id: review.author.id,
        firstName: review.author.firstName || '',
        lastName: review.author.lastName || undefined,
        username: review.author.username || undefined,
      },
      type: review.type,
      event: review.event
        ? {
            id: review.event.id,
            title: review.event.title,
            startDate: review.event.startDate,
          }
        : undefined,
      content: review.content,
      status: review.status,
      isAnonymous: review.isAnonymous,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    }
  }
}
