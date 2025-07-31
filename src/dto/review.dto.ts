import { ReviewType, ReviewStatus } from '../entities/Review'

export interface CreateReviewDto {
  authorId: number
  type: ReviewType
  eventId?: number
  content: string
  status: ReviewStatus
  isAnonymous: boolean
}

export interface UpdateReviewDto {
  content?: string
  status?: ReviewStatus
  isAnonymous?: boolean
}

export interface ReviewDetailsDto {
  id: number
  author: {
    id: number
    firstName: string
    lastName?: string
    username?: string
  }
  type: ReviewType
  event?: {
    id: number
    title: string
    startDate: Date
  }
  content: string
  status: ReviewStatus
  isAnonymous: boolean
  createdAt: Date
  updatedAt: Date
}

export interface ReviewListDto {
  reviews: ReviewDetailsDto[]
  totalCount: number
  currentPage: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}
