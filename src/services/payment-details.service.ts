import { PaymentDetailsRepository } from '../repositories/payment-details.repository'
import { PaymentDetails } from '../entities/PaymentDetails'

export interface CreatePaymentDetailsDto {
  title: string
  description: string
}

export interface UpdatePaymentDetailsDto {
  title?: string
  description?: string
}

export class PaymentDetailsService {
  constructor(private paymentDetailsRepository: PaymentDetailsRepository) {}

  async createPaymentDetails(createDto: CreatePaymentDetailsDto): Promise<PaymentDetails> {
    const paymentDetails = new PaymentDetails()
    paymentDetails.title = createDto.title
    paymentDetails.description = createDto.description

    return this.paymentDetailsRepository.save(paymentDetails)
  }

  async updatePaymentDetails(id: number, updateDto: UpdatePaymentDetailsDto): Promise<PaymentDetails> {
    const paymentDetails = await this.paymentDetailsRepository.findById(id)
    if (!paymentDetails) {
      throw new Error('Payment details not found')
    }

    if (updateDto.title !== undefined) {
      paymentDetails.title = updateDto.title
    }
    if (updateDto.description !== undefined) {
      paymentDetails.description = updateDto.description
    }

    return this.paymentDetailsRepository.save(paymentDetails)
  }

  async getPaymentDetailsById(id: number): Promise<PaymentDetails> {
    const paymentDetails = await this.paymentDetailsRepository.findById(id)
    if (!paymentDetails) {
      throw new Error('Payment details not found')
    }
    return paymentDetails
  }

  async getAllPaymentDetails(): Promise<PaymentDetails[]> {
    return this.paymentDetailsRepository.findAll()
  }

  async deletePaymentDetails(id: number): Promise<void> {
    const paymentDetails = await this.paymentDetailsRepository.findById(id)
    if (!paymentDetails) {
      throw new Error('Payment details not found')
    }

    await this.paymentDetailsRepository.remove(paymentDetails)
  }
}
