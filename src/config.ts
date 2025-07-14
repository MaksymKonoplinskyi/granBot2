// Конфигурация бота
export const ADMINS = process.env.ADMINS || ['397062368']

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
