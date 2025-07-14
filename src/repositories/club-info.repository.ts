import { DataSource, Repository } from 'typeorm'
import { ClubInfo } from '../entities/ClubInfo'

export class ClubInfoRepository {
  private repository: Repository<ClubInfo>

  constructor(private dataSource: DataSource) {
    this.repository = dataSource.getRepository(ClubInfo)
  }

  async save(clubInfo: ClubInfo): Promise<ClubInfo> {
    return this.repository.save(clubInfo)
  }

  async findLatest(): Promise<ClubInfo | null> {
    return this.repository.findOne({
      where: {},
      order: { id: 'DESC' },
    })
  }

  async create(description: string): Promise<ClubInfo> {
    const clubInfo = new ClubInfo()
    clubInfo.description = description
    return this.repository.save(clubInfo)
  }

  async updateLatest(description: string): Promise<ClubInfo> {
    const existing = await this.findLatest()
    if (existing) {
      existing.description = description
      return this.repository.save(existing)
    } else {
      return this.create(description)
    }
  }
}
