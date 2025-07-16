// Конфигурация бота
export const ADMINS = process.env.ADMINS ? process.env.ADMINS.split(',').map(id => id.trim()) : ['397062368']
export const PAYMENT_ADMIN_ID = process.env.PAYMENT_ADMIN_ID || ADMINS[0]

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
