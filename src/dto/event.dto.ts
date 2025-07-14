import { ParticipationStatus } from '../entities/EventParticipant'

export class CreateEventDto {
  title!: string
  description!: string | null
  startDate!: Date
  endDate!: Date
  location?: string | null
  allowOnSitePayment!: boolean
  fullPaymentAmount!: number | null
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
}

export class UpdateEventDto {
  title?: string
  description?: string | null
  startDate?: Date
  endDate?: Date
  location?: string | null
  allowOnSitePayment?: boolean
  fullPaymentAmount?: number | null
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
  isPublished?: boolean
  isCancelled?: boolean
}

export class EventListDto {
  id!: number
  title!: string
  startDate!: Date
  endDate!: Date
  isPublished!: boolean
  isCancelled!: boolean
  participantCount!: number
  userParticipationStatus?: ParticipationStatus
}

export class EventDetailsDto {
  id!: number
  title!: string
  description!: string | null
  startDate!: Date
  endDate!: Date
  location?: string | null
  allowOnSitePayment!: boolean
  fullPaymentAmount!: number | null
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
  isPublished!: boolean
  isCancelled!: boolean
  participantCount!: number
  participants!: EventParticipantDto[]
  userParticipationStatus?: ParticipationStatus
}

export class EventParticipantDto {
  userId!: number
  firstName?: string | null
  username?: string | null
  status!: ParticipationStatus
  joinedAt!: Date
}
