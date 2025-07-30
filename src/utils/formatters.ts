import { EventDetailsDto, EventListDto } from '../dto/event.dto'
import { ParticipationStatus } from '../entities/EventParticipant'
import { MESSAGES } from '../constants/messages'
import { Markup } from 'telegraf'

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

    // Создаем дату в локальном часовом поясе пользователя
    // new Date(year, month-1, day, hours, minutes) создает время в локальном поясе
    const localDate = new Date(year, month - 1, day, hours, minutes, 0)

    // Проверяем что дата валидна
    if (isNaN(localDate.getTime())) return null

    return localDate
  }

  static generateDateTimeExample(): string {
    const now = new Date()
    // Добавляем 1 час к текущему времени для примера
    const exampleDate = new Date(now.getTime() + 60 * 60 * 1000)
    return this.formatDate(exampleDate)
  }
}

// Добавим enum для статуса посещения
export enum AttendanceStatus {
  UNKNOWN = 'unknown', // ❓ По умолчанию
  ATTENDED = 'attended', // ✅ Пришел
  NOT_ATTENDED = 'not_attended', // ❌ Не пришел
}

export enum OnSitePaymentStatus {
  NOT_PAID = 'not_paid', // Не оплачено
  PAID = 'paid', // Оплачено на месте
}

export class MessageFormatter {
  // Новая функция для краткого форматирования события
  static formatEventBrief(
    event: any,
    options?: {
      showAdminStatus?: boolean
      showUserStatus?: boolean
    }
  ): string {
    const { showAdminStatus = false, showUserStatus = false } = options || {}

    let result = `📅 ${event.title}\n` + `Дата начала: ${DateFormatter.formatDate(event.startDate)}\n` + `👥 Количество участников: ${event.participantCount || event.participants?.length || 0}\n`

    if (showAdminStatus) {
      result += `Статус: ${event.isPublished ? '✅ Опубликована' : '📝 Черновик'}\n`
      if (event.isCancelled) {
        result += `Отменена: ❌ Да\n`
      }
    }

    if (showUserStatus && event.userParticipationStatus) {
      result += `Статус: ${this.getParticipationStatusText(event.userParticipationStatus)}\n`
    }

    return result
  }

  static formatEventDetails(event: EventDetailsDto): string {
    return `📅 ${event.title}\n\n` + `📝 Описание:\n${event.description || 'Не указано'}\n\n` + `🕒 Дата начала: ${DateFormatter.formatDate(event.startDate)}\n` + `🕕 Дата окончания: ${DateFormatter.formatDate(event.endDate)}\n` + `📍 Место: ${event.location || 'Не указано'}\n\n` + this.formatPaymentInfo(event) + `\n👥 Количество участников: ${event.participantCount}\n` + `${event.isCancelled ? '❌ Встреча отменена\n' : ''}` + `👤 Ваш статус: ${this.getParticipationStatusText(event.userParticipationStatus)}\n`
  }

  static formatEventList(events: EventListDto[]): string {
    if (events.length === 0) {
      return 'Нет доступных встреч.'
    }

    return events.map(event => this.formatEventBrief(event, { showUserStatus: true })).join('\n')
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
      case ParticipationStatus.PAYMENT_NOT_CHOSEN:
        return '⏳ Выбор способа оплаты'
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

  // Функция для форматирования списка участников для админа
  static formatParticipantsForAdmin(participants: any[]): string {
    if (!participants || participants.length === 0) {
      return '\n👥 Участники: пока никого нет\n'
    }

    let participantsText = '\n👥 Список участников:\n'

    participants.forEach((participant, index) => {
      const name = participant.firstName || 'Без имени'
      const username = participant.username ? `(@${participant.username})` : ''
      const statusIcon = this.getParticipationStatusIcon(participant.status)
      const statusText = this.getParticipationStatusTextForAdmin(participant.status)

      participantsText += `${index + 1}. ${name} ${username}\n   ${statusIcon} ${statusText}\n`
    })

    return participantsText
  }

  // Функция для получения иконки статуса оплаты
  static getParticipationStatusIcon(status: ParticipationStatus): string {
    switch (status) {
      case ParticipationStatus.PAYMENT_CONFIRMED:
        return '✅'
      case ParticipationStatus.PAYMENT_CONFIRMATION:
        return '⏳'
      case ParticipationStatus.PAYMENT_ON_SITE:
        return '🏛️'
      case ParticipationStatus.PENDING_PAYMENT:
        return '⚠️'
      case ParticipationStatus.PAYMENT_NOT_CHOSEN:
        return '⏳'
      case ParticipationStatus.CANCELLED_NO_PAYMENT:
        return '❌'
      case ParticipationStatus.PENDING_REFUND:
        return '💰'
      default:
        return '❓'
    }
  }

  // Функция для получения текста статуса оплаты для админа
  static getParticipationStatusTextForAdmin(status: ParticipationStatus): string {
    switch (status) {
      case ParticipationStatus.PAYMENT_CONFIRMED:
        return 'Оплата подтверждена'
      case ParticipationStatus.PAYMENT_CONFIRMATION:
        return 'Ожидает подтверждения оплаты'
      case ParticipationStatus.PAYMENT_ON_SITE:
        return 'Оплата на месте'
      case ParticipationStatus.PENDING_PAYMENT:
        return 'Ожидает оплаты'
      case ParticipationStatus.PAYMENT_NOT_CHOSEN:
        return 'Выбор способа оплаты'
      case ParticipationStatus.CANCELLED_NO_PAYMENT:
        return 'Отменено без оплаты'
      case ParticipationStatus.PENDING_REFUND:
        return 'Ожидает возврата'
      default:
        return 'Неизвестный статус'
    }
  }

  // Функция для детального отображения события для админа
  static formatEventDetailsForAdmin(event: EventDetailsDto): string {
    const basicInfo = `📅 ${event.title}\n\n` + `📝 Описание:\n${event.description || 'Не указано'}\n\n` + `🕒 Дата начала: ${DateFormatter.formatDate(event.startDate)}\n` + `🕕 Дата окончания: ${DateFormatter.formatDate(event.endDate)}\n` + `📍 Место: ${event.location || 'Не указано'}\n\n` + this.formatPaymentInfo(event) + `\n👥 Всего участников: ${event.participantCount}\n` + `${event.isCancelled ? '❌ Встреча отменена\n' : ''}`

    const participantsList = this.formatParticipantsForAdmin(event.participants)

    return basicInfo + participantsList
  }

  // Обновленная функция для детального списка участников с кнопками управления
  static formatParticipantsDetailed(
    participants: any[],
    options: {
      showRegistrationDate?: boolean
      showPaymentDate?: boolean
      showTelegramContact?: boolean
    } = {},
    attendanceData: Map<number, { attendance: AttendanceStatus; onSitePayment?: OnSitePaymentStatus }> = new Map()
  ): string {
    if (!participants || participants.length === 0) {
      return '👥 Участники: пока никого нет'
    }

    const { showRegistrationDate = false, showPaymentDate = false, showTelegramContact = false } = options

    let participantsText = `👥 Список участников (${participants.length}):\n\n`

    participants.forEach((participant, index) => {
      const name = participant.firstName || 'Без имени'
      const lastName = participant.lastName ? ` ${participant.lastName}` : ''
      const username = participant.username ? `@${participant.username}` : ''
      const statusIcon = this.getParticipationStatusIcon(participant.status)
      const statusText = this.getParticipationStatusTextForAdmin(participant.status)

      // Получаем данные о посещении из карты
      const attendanceInfo = attendanceData.get(participant.userId) || {
        attendance: AttendanceStatus.UNKNOWN,
      }

      participantsText += `${index + 1}. ${name}${lastName}\n`
      participantsText += `   ${statusIcon} ${statusText}\n`

      if (showTelegramContact && username) {
        participantsText += `   📱 ${username}\n`
      }

      if (showRegistrationDate && participant.joinedAt) {
        participantsText += `   📅 Регистрация: ${DateFormatter.formatDate(new Date(participant.joinedAt))}\n`
      }

      if (showPaymentDate && participant.updatedAt && participant.status === 'payment_confirmed') {
        participantsText += `   💰 Оплата: ${DateFormatter.formatDate(new Date(participant.updatedAt))}\n`
      }

      participantsText += '\n'
    })

    return participantsText
  }

  // Функция для создания кнопок управления участниками
  static createParticipantManagementButtons(eventId: number, participants: any[], attendanceData: Map<number, { attendance: AttendanceStatus; onSitePayment?: OnSitePaymentStatus }> = new Map()) {
    const buttons: any[] = []

    participants.forEach((participant, index) => {
      const attendanceInfo = attendanceData.get(participant.userId) || {
        attendance: AttendanceStatus.UNKNOWN,
      }

      const attendanceIcon = this.getAttendanceIcon(attendanceInfo.attendance)
      const name = participant.firstName || 'Без имени'

      const attendanceButton = Markup.button.callback(`${index + 1}. ${name} ${attendanceIcon}`, `toggle_attendance_${eventId}_${participant.userId}`)

      // Проверяем, выбрал ли участник оплату на месте
      const isOnSitePayment = participant.status === 'payment_on_site' || participant.status !== 'payment_confirmed'

      if (isOnSitePayment) {
        const paymentIcon = attendanceInfo.onSitePayment === OnSitePaymentStatus.PAID ? '💰' : '💸'
        const paymentText = attendanceInfo.onSitePayment === OnSitePaymentStatus.PAID ? 'Оплачено' : 'Не оплачено'

        const paymentButton = Markup.button.callback(`${paymentIcon} ${paymentText}`, `toggle_onsite_payment_${eventId}_${participant.userId}`)

        // Размещаем обе кнопки в одном ряду
        buttons.push([attendanceButton, paymentButton])
      } else {
        // Только кнопка посещения
        buttons.push([attendanceButton])
      }
    })

    return buttons
  }

  // Обновленная функция для создания кнопок просмотра участников с управлением
  static createParticipantViewToggleButtons(
    eventId: number,
    currentOptions: {
      showRegistrationDate?: boolean
      showPaymentDate?: boolean
      showTelegramContact?: boolean
    } = {}
  ) {
    const { showRegistrationDate = false, showPaymentDate = false, showTelegramContact = false } = currentOptions

    return [[Markup.button.callback(`${showRegistrationDate ? '✅' : '☐'} Дата регистрации`, `toggle_reg_date_${eventId}`), Markup.button.callback(`${showPaymentDate ? '✅' : '☐'} Дата оплаты`, `toggle_pay_date_${eventId}`)], [Markup.button.callback(`${showTelegramContact ? '✅' : '☐'} Telegram контакт`, `toggle_telegram_${eventId}`)], [Markup.button.callback('🔄 Обновить список', `refresh_participants_${eventId}`)], [Markup.button.callback('◀️ Назад к редактированию', `edit_event_${eventId}`)]]
  }

  // Функция для получения иконки статуса посещения
  static getAttendanceIcon(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.ATTENDED:
        return '✅'
      case AttendanceStatus.NOT_ATTENDED:
        return '❌'
      case AttendanceStatus.UNKNOWN:
      default:
        return '❓'
    }
  }

  // Функция для получения следующего статуса посещения (циклический переход)
  static getNextAttendanceStatus(current: AttendanceStatus): AttendanceStatus {
    switch (current) {
      case AttendanceStatus.UNKNOWN:
        return AttendanceStatus.ATTENDED
      case AttendanceStatus.ATTENDED:
        return AttendanceStatus.NOT_ATTENDED
      case AttendanceStatus.NOT_ATTENDED:
        return AttendanceStatus.UNKNOWN
      default:
        return AttendanceStatus.ATTENDED
    }
  }
}
