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
import { EventRepository } from './repositories/event.repository'
import { UserRepository } from './repositories/user.repository'
import { EventService } from './services/event.service'

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
    console.log('🤖 Создаем экземпляр бота...')
    const bot = new TelegramBot(botConfig, AppDataSource)

    // Инициализируем бота
    console.log('🔧 Инициализируем бота...')
    await bot.init()
    console.log('✅ Бот инициализирован')

    // Запускаем бота с обработкой ошибок
    console.log('🚀 Запускаем бота...')
    if (BOT_CONFIG.WEBHOOK_URL) {
      console.log('🌐 Запуск в режиме webhook...')
      await bot.launchWebhook(BOT_CONFIG.WEBHOOK_URL, BOT_CONFIG.PORT)
    } else {
      console.log('🔄 Запуск в режиме polling...')
      try {
        await bot.launchPolling()
        console.log('✅ Polling запущен успешно')
      } catch (error: any) {
        console.log(`❌ Ошибка при запуске polling: ${error.message}`)
        if (error.description && error.description.includes('Conflict')) {
          console.log('⚠️ Обнаружен конфликт бота (409). Останавливаем другие экземпляры...')
          // Ждем 3 секунды и пытаемся снова
          await new Promise(resolve => setTimeout(resolve, 3000))
          console.log('🔄 Повторная попытка запуска...')
          await bot.launchPolling()
          console.log('✅ Polling запущен успешно (после повтора)')
        } else {
          throw error
        }
      }
    }

    // Создаем EventService для автоматической публикации ПЕРЕД запуском бота
    console.log('📋 Создаем систему автоматической публикации...')
    const eventRepository = new EventRepository(AppDataSource)
    const userRepository = new UserRepository(AppDataSource)
    const eventService = new EventService(eventRepository, userRepository)

    // Выполняем первоначальную проверку при запуске
    console.log('🔍 Выполняем первоначальную проверку отложенных публикаций...')
    try {
      await eventService.checkAndPublishScheduledEvents()
      console.log('✅ Первоначальная проверка завершена успешно')
    } catch (error) {
      console.error('❌ Ошибка в первоначальной проверке:', error)
    }

    // Запускаем автоматическую проверку событий каждые 2 минуты (для более быстрой отработки)
    const checkInterval = setInterval(async () => {
      try {
        console.log('🔄 Запуск периодической проверки отложенных публикаций...')
        await eventService.checkAndPublishScheduledEvents()
      } catch (error) {
        console.error('❌ Ошибка в периодической проверке:', error)
      }
    }, 2 * 60 * 1000) // 2 минуты

    console.log('⏰ Автоматическая проверка отложенных публикаций запущена (каждые 2 минуты)')
    console.log('💡 Система автоматической публикации готова к работе!')

    console.log('✅ Бот запущен успешно!')

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Получен сигнал SIGINT, завершаем работу...')
      clearInterval(checkInterval)
      bot.stop('SIGINT')
      AppDataSource.destroy()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      console.log('\n🛑 Получен сигнал SIGTERM, завершаем работу...')
      clearInterval(checkInterval)
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
