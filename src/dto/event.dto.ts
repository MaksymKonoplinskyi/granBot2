import { ParticipationStatus } from '../entities/EventParticipant'

// Базовый класс с общими полями события
export class BaseEventDto {
  title!: string
  startDate!: Date
  endDate!: Date
}

// Расширенный базовый класс для создания/обновления события
export class EventDataDto extends BaseEventDto {
  description!: string | null
  location?: string | null
  allowOnSitePayment!: boolean
  fullPaymentAmount!: number | null
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
  imageFileId?: string | null
  imageFileName?: string | null
  scheduledPublishDate?: Date | null
}

// DTO для создания события
export class CreateEventDto extends EventDataDto {}

// DTO для обновления события (все поля опциональные)
export class UpdateEventDto implements Partial<EventDataDto> {
  title?: string
  description?: string | null
  startDate?: Date
  endDate?: Date
  location?: string | null
  allowOnSitePayment?: boolean
  fullPaymentAmount?: number | null
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
  imageFileId?: string | null
  imageFileName?: string | null
  scheduledPublishDate?: Date | null
  isPublished?: boolean
  isCancelled?: boolean
}

// Базовый класс для событий с ID и статусом
export class EventWithIdDto extends BaseEventDto {
  id!: number
  isPublished!: boolean
  isCancelled!: boolean
  participantCount!: number
  userParticipationStatus?: ParticipationStatus
}

// DTO для списка событий
export class EventListDto extends EventWithIdDto {}

// DTO для детальной информации о событии
export class EventDetailsDto extends EventWithIdDto {
  description!: string | null
  location?: string | null
  allowOnSitePayment!: boolean
  fullPaymentAmount!: number | null
  advancePaymentAmount?: number | null
  advancePaymentDeadline?: Date | null
  imageFileId?: string | null
  imageFileName?: string | null
  scheduledPublishDate?: Date | null
  participants!: EventParticipantDto[]
}

export class EventParticipantDto {
  userId!: number
  firstName?: string | null
  username?: string | null
  status!: ParticipationStatus
  joinedAt!: Date
}
