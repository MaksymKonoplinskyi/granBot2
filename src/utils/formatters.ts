import { EventDetailsDto, EventListDto } from '../dto/event.dto'
import { ParticipationStatus } from '../entities/EventParticipant'
import { MESSAGES } from '../constants/messages'

export class DateFormatter {
  static formatDate(date: Date | null): string {
    if (!date) return 'Не указана'

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')

    return `${day}.${month}.${year}, ${hours}:${minutes}`
  }

  static parseDateTime(dateTimeStr: string): Date | null {
    const parts = dateTimeStr.match(/^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2})$/)
    if (!parts) return null

    const [_, day, month, year, hours, minutes] = parts.map(Number)
    return new Date(year, month - 1, day, hours, minutes, 0)
  }
}

export class MessageFormatter {
  static formatEventDetails(event: EventDetailsDto): string {
    return `📅 ${event.title}\n\n` + `📝 Описание:\n${event.description || 'Не указано'}\n\n` + `🕒 Дата начала: ${DateFormatter.formatDate(event.startDate)}\n` + `🕕 Дата окончания: ${DateFormatter.formatDate(event.endDate)}\n` + `📍 Место: ${event.location || 'Не указано'}\n\n` + this.formatPaymentInfo(event) + `\n👥 Количество участников: ${event.participantCount}\n` + `${event.isCancelled ? '❌ Встреча отменена\n' : ''}` + `👤 Ваш статус: ${this.getParticipationStatusText(event.userParticipationStatus)}\n`
  }

  static formatEventList(events: EventListDto[]): string {
    if (events.length === 0) {
      return 'Нет доступных встреч.'
    }

    return events.map(event => `📅 ${event.title}\n` + `Дата начала: ${DateFormatter.formatDate(event.startDate)}\n` + `Дата окончания: ${DateFormatter.formatDate(event.endDate)}\n` + `Статус: ${this.getParticipationStatusText(event.userParticipationStatus)}\n`).join('\n')
  }

  static formatPaymentInfo(event: EventDetailsDto): string {
    let paymentInfo = '💰 Стоимость и варианты оплаты:\n'

    if (event.advancePaymentAmount) {
      paymentInfo += `• ${event.advancePaymentAmount} грн. в случае оплаты заранее${event.advancePaymentDeadline ? ` (не позднее ${DateFormatter.formatDate(event.advancePaymentDeadline)})` : ''}\n`
    }

    if (event.fullPaymentAmount) {
      paymentInfo += `• ${event.fullPaymentAmount} грн. в случае оплаты${event.advancePaymentDeadline ? ` после ${DateFormatter.formatDate(event.advancePaymentDeadline)}` : ''}${event.allowOnSitePayment ? ' или при встрече' : ''}\n`
    }

    return paymentInfo
  }

  static getParticipationStatusText(status?: ParticipationStatus): string {
    if (!status) return MESSAGES.STATUS_NOT_PARTICIPANT

    switch (status) {
      case ParticipationStatus.PAYMENT_CONFIRMED:
        return MESSAGES.STATUS_PAYMENT_CONFIRMED
      case ParticipationStatus.PAYMENT_CONFIRMATION:
        return MESSAGES.STATUS_PAYMENT_CONFIRMATION
      case ParticipationStatus.PAYMENT_ON_SITE:
        return MESSAGES.STATUS_PAYMENT_ON_SITE
      default:
        return MESSAGES.STATUS_PAYMENT_REQUIRED
    }
  }

  static formatEventCreationProgress(step: number, totalSteps: number, eventData: any): string {
    let progress = `Этап ${step}/${totalSteps}:\n\n`

    if (eventData.title) {
      progress += `Название: ${eventData.title}\n`
    }

    if (eventData.startDate) {
      progress += `Дата начала: ${DateFormatter.formatDate(eventData.startDate)}\n`
    }

    if (eventData.endDate) {
      progress += `Дата окончания: ${DateFormatter.formatDate(eventData.endDate)}\n`
    }

    if (eventData.description) {
      progress += `Описание: ${eventData.description}\n`
    }

    if (eventData.allowOnSitePayment !== undefined) {
      progress += `Оплата на месте: ${eventData.allowOnSitePayment ? '✅ Разрешена' : '❌ Запрещена'}\n`
    }

    if (eventData.fullPaymentAmount !== undefined) {
      progress += `Стоимость при встрече: ${eventData.fullPaymentAmount} грн.\n`
    }

    if (eventData.advancePaymentAmount !== undefined) {
      progress += `Стоимость при оплате заранее: ${eventData.advancePaymentAmount} грн.\n`
    }

    if (eventData.advancePaymentDeadline) {
      progress += `Крайний срок оплаты заранее: ${DateFormatter.formatDate(eventData.advancePaymentDeadline)}\n`
    }

    return progress
  }
}
