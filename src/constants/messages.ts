export const MESSAGES = {
  // Основные сообщения
  MAIN_MENU: 'Главное меню:',
  ADMIN_PANEL: 'Админ-панель:',

  // Ошибки
  ERROR_GENERAL: 'Произошла ошибка при обработке запроса',
  ERROR_EVENT_NOT_FOUND: 'Встреча не найдена',
  ERROR_ACCESS_DENIED: 'У вас нет прав администратора',
  ERROR_INVALID_DATE_FORMAT: 'Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ',
  ERROR_INVALID_AMOUNT: 'Пожалуйста, введите корректную сумму (положительное число)',
  ERROR_ALREADY_PARTICIPANT: 'Вы уже участвуете в этой встрече',
  ERROR_NOT_PARTICIPANT: 'Вы не участвуете в этой встрече',

  // Успешные действия
  SUCCESS_EVENT_CREATED: 'Встреча создана!',
  SUCCESS_EVENT_UPDATED: 'Поле успешно обновлено!',
  SUCCESS_EVENT_PUBLISHED: 'Встреча успешно опубликована!',
  SUCCESS_EVENT_DELETED: '✅ Встреча успешно удалена.',
  SUCCESS_PAYMENT_CONFIRMED: 'Ваша оплата подтверждена!',
  SUCCESS_JOINED_EVENT: 'Вы успешно зарегистрировались на встречу!',
  SUCCESS_LEFT_EVENT: 'Вы отменили участие в встрече',

  // Создание встречи
  CREATE_EVENT_TITLE: 'Этап 1/7: Введите название встречи:',
  CREATE_EVENT_START_DATE: 'Этап 2/7: Введите дату начала (ДД.ММ.ГГГГ, ЧЧ:ММ):',
  CREATE_EVENT_END_DATE: 'Этап 3/7: Введите дату окончания (ДД.ММ.ГГГГ, ЧЧ:ММ):',
  CREATE_EVENT_DESCRIPTION: 'Этап 4/7: Введите описание встречи:',
  CREATE_EVENT_PAYMENT_ONSITE: 'Этап 5/7: Настройка оплаты\nРазрешить оплату на месте?',
  CREATE_EVENT_FULL_AMOUNT: 'Этап 6/8: Введите сумму полной оплаты (только число, без валюты):',
  CREATE_EVENT_ADVANCE_AMOUNT: 'Этап 7/8: Введите цену участия при оплате заранее (только число, без валюты, или 0 если оплата заранее не возможна):',
  CREATE_EVENT_DEADLINE: 'Этап 8/8: Введите дату и время крайнего срока оплаты заранее (ДД.ММ.ГГГГ, ЧЧ:ММ):',

  // Статусы участия
  STATUS_NOT_PARTICIPANT: '❌ Вы не участвуете',
  STATUS_PAYMENT_CONFIRMED: '✅ Оплата подтверждена',
  STATUS_PAYMENT_CONFIRMATION: '⏳ Ожидает подтверждения оплаты',
  STATUS_PAYMENT_ON_SITE: '💳 Оплата при встрече',
  STATUS_PAYMENT_REQUIRED: '❌ Требуется оплата',

  // Подтверждения
  CONFIRM_DELETE_EVENT: '⚠️ ВНИМАНИЕ: Это действие необратимо!\nДля подтверждения удаления встречи введите пинкод:',
  CONFIRM_PAYMENT: 'После оплаты нажмите кнопку "Я оплатил"',

  // Уведомления
  NOTIFICATION_PAYMENT_PENDING: 'Мы получили Ваше подтверждение об оплате.\nМакс скоро проверит оплату и подтвердит ваше участие.',
  NOTIFICATION_REMIND_LATER: 'Мы напомним вам об оплате позже',

  // Пустые списки
  EMPTY_UPCOMING_EVENTS: 'На данный момент нет предстоящих встреч.',
  EMPTY_PAST_EVENTS: 'Нет прошедших встреч.',
  EMPTY_USER_EVENTS: 'У вас нет встреч.',

  // Помощь
  HELP_TEXT: `🤖 Помощь по использованию бота:

/start - открыть главное меню
/events - просмотр всех встреч
/my_events - просмотр моих встреч
/help - показать это сообщение

Для администраторов:
• Создание новых встреч
• Редактирование существующих встреч
• Публикация и отмена встреч`,
} as const

export const BUTTONS = {
  // Основные кнопки
  MAIN_MENU: '🏠 Главное меню',
  BACK: '◀️ Назад',
  CANCEL: '❌ Отмена',
  YES: '✅ Да',
  NO: '❌ Нет',

  // Встречи
  UPCOMING_EVENTS: '▶️ Ближайшие встречи',
  MY_EVENTS: 'Мои встречи',
  JOIN_EVENT: '✅ Принять участие',
  LEAVE_EVENT: '❌ Отменить участие',
  EVENT_DETAILS: '📋 Подробнее',

  // Админ
  ADMIN_PANEL: 'Админка',
  CREATE_EVENT: '➕ Создать встречу',
  EDIT_EVENT: '✏️ Редактировать',
  DELETE_EVENT: '🗑 Удалить встречу',
  PUBLISH_EVENT: '✅ Опубликовать',
  UNPUBLISH_EVENT: '📝 Сделать черновиком',

  // Оплата
  PAY_NOW: '💳 Оплатить сейчас',
  PAY_ON_SITE: '💵 Оплата при встрече',
  PAY_ADVANCE: '💳 Оплатить заранее',
  PAY_FULL: '💳 Полная оплата',
  PAYMENT_CONFIRMED: '✅ Я оплатил',

  // Время
  DAY_BEFORE: '⏰ За сутки до начала встречи',
  REMIND_LATER: '⏰ Напомнить позже',
} as const

export const VALIDATION = {
  PIN_CODE: '7777',
  DATE_FORMAT_REGEX: /^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2})$/,
  AMOUNT_MIN: 0,
} as const
