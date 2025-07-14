// Конфигурация бота
export const ADMINS = [
  '123456789', // Замените на реальные ID администраторов
  '987654321', // Добавьте дополнительные ID админов по необходимости
]

export const BOT_CONFIG = {
  TOKEN: process.env.BOT_TOKEN || '',
  VERBOSE: process.env.NODE_ENV === 'development',
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  PORT: parseInt(process.env.PORT || '3000'),
  PIN_CODE: '7777',
}

export const DATABASE_CONFIG = {
  TYPE: 'sqlite' as const,
  DATABASE: process.env.DATABASE_PATH || 'database.sqlite',
  SYNCHRONIZE: process.env.NODE_ENV === 'development',
  LOGGING: process.env.NODE_ENV === 'development',
}
