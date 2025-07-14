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
}
