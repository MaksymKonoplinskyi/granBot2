import { DataSource, Repository } from 'typeorm'
import { User } from '../entities/User'

export class UserRepository {
  private repository: Repository<User>

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(User)
  }

  async save(user: User): Promise<User> {
    return await this.repository.save(user)
  }

  async findByTelegramId(telegramId: number): Promise<User | null> {
    return await this.repository.findOne({ where: { telegramId } })
  }

  async findOrCreateByTelegramId(telegramId: number, username?: string, firstName?: string, lastName?: string): Promise<User> {
    let user = await this.findByTelegramId(telegramId)

    if (!user) {
      user = new User()
      user.telegramId = telegramId
      user.username = username || null
      user.firstName = firstName || null
      user.lastName = lastName || null
      await this.save(user)
    }

    return user
  }

  async updateUser(telegramId: number, updates: Partial<User>): Promise<User | null> {
    const user = await this.findByTelegramId(telegramId)
    if (!user) return null

    Object.assign(user, updates)
    return await this.save(user)
  }
}
