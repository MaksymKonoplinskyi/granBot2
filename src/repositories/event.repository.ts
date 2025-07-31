import { DataSource, Repository, MoreThan, LessThan } from 'typeorm'
import { Event } from '../entities/Event'
import { EventParticipant } from '../entities/EventParticipant'

export class EventRepository {
  private repository: Repository<Event>
  private participantRepository: Repository<EventParticipant>

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(Event)
    this.participantRepository = this.dataSource.getRepository(EventParticipant)
  }

  async save(event: Event): Promise<Event> {
    return await this.repository.save(event)
  }

  async remove(event: Event): Promise<void> {
    await this.repository.remove(event)
  }

  async findById(id: number): Promise<Event | null> {
    return await this.repository.findOne({ where: { id } })
  }

  async findWithParticipants(id: number): Promise<Event | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['participants', 'participants.user'],
    })
  }

  async findUpcoming(): Promise<Event[]> {
    const now = new Date()
    return await this.repository.find({
      where: {
        startDate: MoreThan(now),
        isPublished: true,
        isCancelled: false,
      },
      relations: ['participants', 'participants.user'],
      order: { startDate: 'ASC' },
    })
  }

  async findPast(): Promise<Event[]> {
    const now = new Date()
    return await this.repository.find({
      where: {
        startDate: LessThan(now),
        isPublished: true,
        isCancelled: false,
      },
      relations: ['participants', 'participants.user'],
      order: { startDate: 'DESC' },
    })
  }

  async findUserUpcoming(userId: number): Promise<Event[]> {
    const now = new Date()
    return await this.repository.find({
      where: {
        startDate: MoreThan(now),
        isPublished: true,
        isCancelled: false,
        participants: {
          user: { telegramId: userId },
        },
      },
      relations: ['participants', 'participants.user'],
      order: { startDate: 'ASC' },
    })
  }

  async findUserPast(userId: number): Promise<Event[]> {
    const now = new Date()
    return await this.repository.find({
      where: {
        startDate: LessThan(now),
        isPublished: true,
        isCancelled: false,
        participants: {
          user: { telegramId: userId },
        },
      },
      relations: ['participants', 'participants.user'],
      order: { startDate: 'DESC' },
    })
  }

  async findParticipation(eventId: number, userId: number): Promise<EventParticipant | null> {
    return await this.participantRepository.findOne({
      where: {
        event: { id: eventId },
        user: { telegramId: userId },
      },
      relations: ['event', 'user'],
    })
  }

  async saveParticipation(participation: EventParticipant): Promise<EventParticipant> {
    return await this.participantRepository.save(participation)
  }

  async removeParticipation(participation: EventParticipant): Promise<void> {
    await this.participantRepository.remove(participation)
  }

  async findAll(): Promise<Event[]> {
    return this.repository.find({
      relations: ['participants', 'participants.user'],
      order: { startDate: 'DESC' },
    })
  }

  async findScheduledForPublish(currentDate: Date): Promise<Event[]> {
    return this.repository.createQueryBuilder('event').leftJoinAndSelect('event.participants', 'participants').leftJoinAndSelect('participants.user', 'user').where('event.isPublished = :isPublished', { isPublished: false }).andWhere('event.isCancelled = :isCancelled', { isCancelled: false }).andWhere('event.scheduledPublishDate IS NOT NULL').andWhere('event.scheduledPublishDate < :currentDate', { currentDate: currentDate.toISOString() }).getMany()
  }

  async getUserAttendedEvents(internalUserId: number): Promise<Event[]> {
    const currentDate = new Date()

    return this.repository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'user')
      .where('event.endDate < :currentDate', { currentDate })
      .andWhere('event.isPublished = :isPublished', { isPublished: true })
      .andWhere('event.isCancelled = :isCancelled', { isCancelled: false })
      .andWhere('participants.user.id = :internalUserId', { internalUserId })
      .andWhere('participants.status IN (:...statuses)', { statuses: ['payment_on_site', 'payment_confirmed'] })
      .orderBy('event.startDate', 'DESC')
      .getMany()
  }
}
