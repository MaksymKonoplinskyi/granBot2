import { DataSource, Repository } from 'typeorm'
import { PaymentDetails } from '../entities/PaymentDetails'

export class PaymentDetailsRepository {
  private repository: Repository<PaymentDetails>

  constructor(private dataSource: DataSource) {
    this.repository = dataSource.getRepository(PaymentDetails)
  }

  async save(paymentDetails: PaymentDetails): Promise<PaymentDetails> {
    return this.repository.save(paymentDetails)
  }

  async remove(paymentDetails: PaymentDetails): Promise<void> {
    await this.repository.remove(paymentDetails)
  }

  async findById(id: number): Promise<PaymentDetails | null> {
    return this.repository.findOneBy({ id })
  }

  async findAll(): Promise<PaymentDetails[]> {
    return this.repository.find({
      order: { id: 'ASC' },
    })
  }

  async deleteById(id: number): Promise<void> {
    await this.repository.delete(id)
  }
}
