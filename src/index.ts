import 'reflect-metadata'
import dotenv from 'dotenv'
import { DataSource } from 'typeorm'

// Загружаем переменные окружения из .env файла
dotenv.config()

// Проверяем обязательные переменные окружения
const requiredEnvVars = ['BOT_TOKEN']
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Ошибка: Переменная окружения ${envVar} не установлена!`)
    console.error(`Создайте файл .env на основе env.example и установите все необходимые переменные.`)
    process.exit(1)
  }
}

import { TelegramBot } from './bot/bot'
import { BOT_CONFIG, DATABASE_CONFIG } from './config'
import { Event } from './entities/Event'
import { EventParticipant } from './entities/EventParticipant'
import { User } from './entities/User'
import { PaymentDetails } from './entities/PaymentDetails'
import { ClubInfo } from './entities/ClubInfo'

// Создаем конфигурацию базы данных
const AppDataSource = new DataSource({
  type: DATABASE_CONFIG.TYPE,
  database: DATABASE_CONFIG.DATABASE,
  synchronize: true, // Автоматически создаем таблицы
  logging: DATABASE_CONFIG.LOGGING,
  entities: [Event, EventParticipant, User, PaymentDetails, ClubInfo],
  migrations: [],
  subscribers: [],
})

async function main() {
  try {
    // Инициализируем базу данных
    await AppDataSource.initialize()
    console.log('✅ Подключение к базе данных установлено')

    // Проверяем, что таблицы созданы
    const queryRunner = AppDataSource.createQueryRunner()
    const tables = await queryRunner.getTables()
    console.log('📊 Созданные таблицы:', tables.map(t => t.name).join(', '))
    await queryRunner.release()

    // Создаем конфигурацию бота
    const botConfig = {
      token: BOT_CONFIG.TOKEN,
      verbose: BOT_CONFIG.VERBOSE,
      webhookUrl: BOT_CONFIG.WEBHOOK_URL,
      port: BOT_CONFIG.PORT,
    }

    // Создаем экземпляр бота
    const bot = new TelegramBot(botConfig, AppDataSource)

    // Инициализируем бота
    await bot.init()

    // Запускаем бота
    if (BOT_CONFIG.WEBHOOK_URL) {
      await bot.launchWebhook(BOT_CONFIG.WEBHOOK_URL, BOT_CONFIG.PORT)
    } else {
      await bot.launchPolling()
    }

    console.log('✅ Бот запущен успешно!')

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Получен сигнал SIGINT, завершаем работу...')
      bot.stop('SIGINT')
      AppDataSource.destroy()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      console.log('\n🛑 Получен сигнал SIGTERM, завершаем работу...')
      bot.stop('SIGTERM')
      AppDataSource.destroy()
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ Ошибка при запуске бота:', error)
    process.exit(1)
  }
}

main().catch(console.error)
