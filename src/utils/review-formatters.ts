import { ReviewDetailsDto } from '../dto/review.dto'
import { ReviewStatus } from '../entities/Review'
import { DateFormatter } from './formatters'

export class ReviewFormatter {
  static formatReviewForUser(review: ReviewDetailsDto): string {
    let authorName = review.isAnonymous ? 'Анонимный отзыв' : this.formatAuthorName(review.author)

    const date = DateFormatter.formatDate(review.createdAt)

    let header = `${authorName} | 📅 ${date}`

    let content = ''
    if (review.type === 'club') {
      content = `💭 О клубе:\n"${review.content}"`
    } else if (review.event) {
      const eventDate = DateFormatter.formatDate(review.event.startDate).split(',')[0] // Только дата без времени
      content = `💭 О встрече "${review.event.title}" (${eventDate}):\n"${review.content}"`
    }

    return `${header}\n${content}`
  }

  static formatReviewForAdmin(review: ReviewDetailsDto): string {
    const authorName = this.formatAuthorNameWithUsername(review.author)
    const date = DateFormatter.formatDate(review.createdAt)
    const status = this.formatStatusTag(review.status)

    let header = `👤 ${authorName} | 📅 ${date} | 🏷️ ${status}`

    if (review.isAnonymous && review.status === ReviewStatus.PUBLIC) {
      header += ' | 🕶️ Анонимный'
    }

    let content = ''
    if (review.type === 'club') {
      content = `💭 О клубе:\n"${review.content}"`
    } else if (review.event) {
      const eventDate = DateFormatter.formatDate(review.event.startDate).split(',')[0] // Только дата без времени
      content = `💭 О встрече "${review.event.title}" (${eventDate}):\n"${review.content}"`
    }

    return `${header}\n${content}`
  }

  private static formatAuthorName(author: { firstName: string; lastName?: string }): string {
    return author.lastName ? `${author.firstName} ${author.lastName}` : author.firstName
  }

  private static formatAuthorNameWithUsername(author: { firstName: string; lastName?: string; username?: string }): string {
    const name = this.formatAuthorName(author)
    const username = author.username ? ` (@${author.username})` : ''
    return `${name}${username}`
  }

  private static formatStatusTag(status: ReviewStatus): string {
    switch (status) {
      case ReviewStatus.PUBLIC:
        return 'Публичный'
      case ReviewStatus.PRIVATE:
        return 'Только для организаторов'
      case ReviewStatus.HIDDEN:
        return 'Скрытый'
      default:
        return 'Неизвестно'
    }
  }
}
