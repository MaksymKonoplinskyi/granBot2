import { VALIDATION } from '../constants/messages'
import { DateFormatter } from './formatters'

export class ValidationResult {
  constructor(public isValid: boolean, public error?: string, public value?: any) {}
}

export class Validators {
  static validateDate(dateStr: string): ValidationResult {
    const date = DateFormatter.parseDateTime(dateStr)

    if (!date) {
      return new ValidationResult(false, 'Неверный формат даты. Используйте формат ДД.ММ.ГГГГ, ЧЧ:ММ')
    }

    if (isNaN(date.getTime())) {
      return new ValidationResult(false, 'Некорректная дата')
    }

    return new ValidationResult(true, undefined, date)
  }

  static validateAmount(amountStr: string): ValidationResult {
    const amount = parseFloat(amountStr)

    if (isNaN(amount)) {
      return new ValidationResult(false, 'Сумма должна быть числом')
    }

    if (amount < VALIDATION.AMOUNT_MIN) {
      return new ValidationResult(false, 'Сумма должна быть положительным числом')
    }

    return new ValidationResult(true, undefined, amount)
  }

  static validateText(text: string, minLength: number = 1, maxLength: number = 1000): ValidationResult {
    if (!text || text.trim().length === 0) {
      return new ValidationResult(false, 'Текст не может быть пустым')
    }

    if (text.length < minLength) {
      return new ValidationResult(false, `Текст должен содержать минимум ${minLength} символов`)
    }

    if (text.length > maxLength) {
      return new ValidationResult(false, `Текст должен содержать максимум ${maxLength} символов`)
    }

    return new ValidationResult(true, undefined, text.trim())
  }

  static validatePinCode(pin: string): ValidationResult {
    if (pin !== VALIDATION.PIN_CODE) {
      return new ValidationResult(false, 'Неверный пинкод')
    }

    return new ValidationResult(true)
  }

  static validateEventDates(startDate: Date, endDate: Date): ValidationResult {
    if (startDate >= endDate) {
      return new ValidationResult(false, 'Дата начала должна быть раньше даты окончания')
    }

    const now = new Date()
    if (startDate <= now) {
      return new ValidationResult(false, 'Дата начала должна быть в будущем')
    }

    return new ValidationResult(true)
  }

  static validatePaymentDeadline(deadline: Date, eventStartDate: Date): ValidationResult {
    if (deadline >= eventStartDate) {
      return new ValidationResult(false, 'Срок оплаты должен быть до начала встречи')
    }

    const now = new Date()
    if (deadline <= now) {
      return new ValidationResult(false, 'Срок оплаты должен быть в будущем')
    }

    return new ValidationResult(true)
  }

  static validateRequired<T>(value: T | undefined | null, fieldName: string): ValidationResult {
    if (value === undefined || value === null || value === '') {
      return new ValidationResult(false, `Поле "${fieldName}" обязательно для заполнения`)
    }

    return new ValidationResult(true, undefined, value)
  }
}
