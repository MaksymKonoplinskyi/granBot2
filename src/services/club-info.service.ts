import { ClubInfoRepository } from '../repositories/club-info.repository'
import { ClubInfo } from '../entities/ClubInfo'

export class ClubInfoService {
  constructor(private clubInfoRepository: ClubInfoRepository) {}

  async getClubInfo(): Promise<ClubInfo | null> {
    return this.clubInfoRepository.findLatest()
  }

  async updateClubInfo(description: string): Promise<ClubInfo> {
    return this.clubInfoRepository.updateLatest(description)
  }

  async getClubInfoOrDefault(): Promise<string> {
    const clubInfo = await this.getClubInfo()
    return clubInfo ? clubInfo.description : 'Информация еще не заполнена'
  }
}
