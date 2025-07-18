import { DataSource, MoreThan, LessThan } from 'typeorm'
import { Event } from '../entities/Event'
import { EventParticipant, ParticipationStatus } from '../entities/EventParticipant'
import { User } from '../entities/User'
import { CreateEventDto, UpdateEventDto, EventListDto, EventDetailsDto, EventParticipantDto } from '../dto/event.dto'
import { EventRepository } from '../repositories/event.repository'
import { UserRepository } from '../repositories/user.repository'

export class EventService {
  constructor(private eventRepository: EventRepository, private userRepository: UserRepository) {}

  async createEvent(createEventDto: CreateEventDto): Promise<Event> {
    const event = new Event()
    Object.assign(event, createEventDto)
    event.isPublished = false
    event.isCancelled = false

    return await this.eventRepository.save(event)
  }

  async updateEvent(id: number, updateEventDto: UpdateEventDto): Promise<Event> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error('Event not found')
    }

    Object.assign(event, updateEventDto)
    return await this.eventRepository.save(event)
  }

  async deleteEvent(id: number): Promise<void> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error('Event not found')
    }

    await this.eventRepository.remove(event)
  }

  async getEventById(id: number): Promise<Event | null> {
    return await this.eventRepository.findById(id)
  }

  async getEventDetails(id: number, userId?: number): Promise<EventDetailsDto> {
    const event = await this.eventRepository.findWithParticipants(id)
    if (!event) {
      throw new Error('Event not found')
    }

    const participants = event.participants.map(p => ({
      userId: p.user.id,
      firstName: p.user.firstName,
      username: p.user.username,
      status: p.status,
      joinedAt: p.joinedAt,
    }))

    const userParticipationStatus = userId ? event.participants.find(p => p.user.telegramId === userId)?.status : undefined

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      allowOnSitePayment: event.allowOnSitePayment,
      fullPaymentAmount: event.fullPaymentAmount,
      advancePaymentAmount: event.advancePaymentAmount,
      advancePaymentDeadline: event.advancePaymentDeadline,
      imageFileId: event.imageFileId,
      imageFileName: event.imageFileName,
      isPublished: event.isPublished,
      isCancelled: event.isCancelled,
      participantCount: event.participants.length,
      participants,
      userParticipationStatus,
    }
  }

  async getUpcomingEvents(userId?: number): Promise<EventListDto[]> {
    const events = await this.eventRepository.findUpcoming()
    return this.mapToEventListDto(events, userId)
  }

  async getPastEvents(userId?: number): Promise<EventListDto[]> {
    const events = await this.eventRepository.findPast()
    return this.mapToEventListDto(events, userId)
  }

  async getUserEvents(userId: number, upcoming: boolean = true): Promise<EventListDto[]> {
    const events = upcoming ? await this.eventRepository.findUserUpcoming(userId) : await this.eventRepository.findUserPast(userId)

    return this.mapToEventListDto(events, userId)
  }

  async joinEvent(eventId: number, userId: number, status: ParticipationStatus, userData?: { username?: string; firstName?: string; lastName?: string }): Promise<void> {
    const event = await this.eventRepository.findById(eventId)
    if (!event) {
      throw new Error('Event not found')
    }

    // Автоматически создаем пользователя, если его нет
    const user = await this.userRepository.findOrCreateByTelegramId(userId, userData?.username, userData?.firstName, userData?.lastName)
    if (!user) {
      throw new Error('User not found')
    }

    const existingParticipation = await this.eventRepository.findParticipation(eventId, userId)
    if (existingParticipation) {
      throw new Error('User already participating')
    }

    const participant = new EventParticipant()
    participant.user = user
    participant.event = event
    participant.status = status
    participant.joinedAt = new Date()

    await this.eventRepository.saveParticipation(participant)
  }

  async leaveEvent(eventId: number, userId: number): Promise<void> {
    const participation = await this.eventRepository.findParticipation(eventId, userId)
    if (!participation) {
      throw new Error('User not participating')
    }

    await this.eventRepository.removeParticipation(participation)
  }

  async updateParticipationStatus(eventId: number, userId: number, status: ParticipationStatus): Promise<void> {
    const participation = await this.eventRepository.findParticipation(eventId, userId)
    if (!participation) {
      throw new Error('User not participating')
    }

    participation.status = status
    await this.eventRepository.saveParticipation(participation)
  }

  async publishEvent(id: number): Promise<void> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error('Event not found')
    }

    if (!this.isEventComplete(event)) {
      throw new Error('Event is not complete')
    }

    event.isPublished = true
    await this.eventRepository.save(event)
  }

  async cancelEvent(id: number): Promise<void> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error('Event not found')
    }

    event.isCancelled = true
    await this.eventRepository.save(event)
  }

  private isEventComplete(event: Event): boolean {
    return !!(event.title && event.description && event.startDate && event.endDate && event.fullPaymentAmount !== undefined)
  }

  private mapToEventListDto(events: Event[], userId?: number): EventListDto[] {
    return events.map(event => {
      const userParticipation = userId ? event.participants?.find(p => p.user.telegramId === userId) : undefined

      return {
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        fullPaymentAmount: event.fullPaymentAmount || 0,
        advancePaymentAmount: event.advancePaymentAmount,
        advancePaymentDeadline: event.advancePaymentDeadline,
        allowOnSitePayment: event.allowOnSitePayment,
        isPublished: event.isPublished,
        isCancelled: event.isCancelled,
        participantCount: event.participants?.length || 0,
        userParticipationStatus: userParticipation?.status,
      }
    })
  }

  // Административные методы
  async getUpcomingEventsAdmin(): Promise<Event[]> {
    return this.eventRepository.findUpcoming()
  }

  async getPastEventsAdmin(): Promise<Event[]> {
    return this.eventRepository.findPast()
  }

  async getAllEventsAdmin(): Promise<Event[]> {
    return this.eventRepository.findAll()
  }

  async getEventForEdit(id: number): Promise<Event> {
    const event = await this.eventRepository.findWithParticipants(id)
    if (!event) {
      throw new Error('Event not found')
    }
    return event
  }

  async updateEventField(id: number, field: string, value: any): Promise<Event> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      throw new Error('Event not found')
    }

    // Динамическое обновление поля
    ;(event as any)[field] = value

    return this.eventRepository.save(event)
  }

  async confirmPayment(eventId: number, userId: number): Promise<void> {
    await this.updateParticipationStatus(eventId, userId, ParticipationStatus.PAYMENT_CONFIRMED)
  }

  async setPaymentConfirmation(eventId: number, userId: number): Promise<void> {
    await this.updateParticipationStatus(eventId, userId, ParticipationStatus.PAYMENT_CONFIRMATION)
  }

  async validateEventForPublish(id: number): Promise<boolean> {
    const event = await this.eventRepository.findById(id)
    if (!event) {
      return false
    }
    return this.isEventComplete(event)
  }
}
