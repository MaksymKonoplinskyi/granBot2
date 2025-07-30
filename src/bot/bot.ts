import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { DataSource } from 'typeorm'
import { BotContext, BotConfig } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { PaymentDetailsService } from '../services/payment-details.service'
import { ClubInfoService } from '../services/club-info.service'
import { EventRepository } from '../repositories/event.repository'
import { UserRepository } from '../repositories/user.repository'
import { PaymentDetailsRepository } from '../repositories/payment-details.repository'
import { ClubInfoRepository } from '../repositories/club-info.repository'
import { EventController } from '../controllers/event.controller'
import { AdminController } from '../controllers/admin.controller'
import { PaymentDetailsController } from '../controllers/payment-details.controller'
import { ClubInfoController } from '../controllers/club-info.controller'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { ADMINS, PAYMENT_ADMIN_ID } from '../config'
import { safeEditMessage } from '../utils/message-utils'
import { DateFormatter } from '../utils/formatters'
import { MessageFormatter } from '../utils/formatters'
import { ParticipationStatus } from '../entities/EventParticipant'

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

export class TelegramBot {
  private readonly bot: Telegraf<BotContext>
  private readonly eventService: EventService
  private readonly paymentDetailsService: PaymentDetailsService
  private readonly clubInfoService: ClubInfoService
  private readonly userRepository: UserRepository
  private readonly eventController: EventController
  private readonly adminController: AdminController
  private readonly paymentDetailsController: PaymentDetailsController
  private readonly clubInfoController: ClubInfoController
  private isInitialized = false
  private stage!: Scenes.Stage<BotContext>

  constructor(private readonly config: BotConfig, private readonly dataSource: DataSource) {
    this.bot = new Telegraf<BotContext>(config.token)

    // Dependency injection
    const eventRepository = new EventRepository(dataSource)
    const userRepository = new UserRepository(dataSource)
    const paymentDetailsRepository = new PaymentDetailsRepository(dataSource)
    const clubInfoRepository = new ClubInfoRepository(dataSource)

    this.eventService = new EventService(eventRepository, userRepository)
    this.paymentDetailsService = new PaymentDetailsService(paymentDetailsRepository)
    this.clubInfoService = new ClubInfoService(clubInfoRepository)
    this.userRepository = userRepository

    this.paymentDetailsController = new PaymentDetailsController(this.paymentDetailsService)
    this.eventController = new EventController(this.eventService, this.paymentDetailsController)
    this.adminController = new AdminController(this.eventService, this.paymentDetailsService, this.clubInfoService)
    this.clubInfoController = new ClubInfoController(this.clubInfoService)

    this.setupErrorHandling()
    this.setupCommands()
    this.setupScenes()
    this.setupActions()
  }

  private setupErrorHandling(): void {
    this.bot.catch((err: unknown, ctx: BotContext) => {
      console.error(`Error for ${ctx.updateType}:`, err)
      ctx.reply(MESSAGES.ERROR_GENERAL).catch(console.error)
    })
  }

  private createUserMiddleware() {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      if (ctx.from?.id) {
        try {
          await this.userRepository.findOrCreateByTelegramId(ctx.from.id, ctx.from.username, ctx.from.first_name, ctx.from.last_name)

          // Периодически проверяем и переустанавливаем команды для конкретного пользователя
          // Делаем это только для каждого 50-го пользователя, чтобы не перегружать API
          if (Math.random() < 0.02) {
            // 2% вероятность
            this.ensureCommandsAreSet().catch(console.error)
          }
        } catch (error) {
          console.error('Error creating/finding user:', error)
        }
      }
      return next()
    }
  }

  private createSchedulePublishMiddleware() {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      const session = ctx.session as any
      if (session?.awaitingScheduleDate && ctx.message && 'text' in ctx.message) {
        const eventId = session.awaitingScheduleDate
        delete session.awaitingScheduleDate

        try {
          const scheduledDate = this.parseDateTime(ctx.message.text)
          if (!scheduledDate) {
            await ctx.reply('❌ Неверный формат даты. Пожалуйста, введите в формате ДД.ММ.ГГГГ, ЧЧ:ММ')
            return
          }

          const now = new Date()
          if (scheduledDate <= now) {
            await ctx.reply('❌ Дата публикации должна быть в будущем.')
            return
          }

          await this.eventService.scheduleEventPublish(eventId, scheduledDate)
          await ctx.reply(`✅ Отложенная публикация настроена на ${this.formatDate(scheduledDate)}!`)
        } catch (error) {
          console.error('Error scheduling publish:', error)
          await ctx.reply('❌ Ошибка при настройке отложенной публикации.')
        }
        return
      }
      return next()
    }
  }

  private parseDateTime(dateTimeStr: string): Date | null {
    const parts = dateTimeStr.match(/^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2})$/)
    if (!parts) {
      return null
    }
    const [_, day, month, year, hours, minutes] = parts.map(Number)
    const date = new Date(year, month - 1, day, hours, minutes, 0)
    return date
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  private setupCommands(): void {
    // Команды будут установлены после запуска бота в методе init()

    // Команда старт
    this.bot.start(ctx => {
      const buttons = [[Markup.button.callback(BUTTONS.UPCOMING_EVENTS, 'new_events'), Markup.button.callback(BUTTONS.MY_EVENTS, 'my_events')], [Markup.button.callback('Отзывы', 'reviews'), Markup.button.callback('О клубе', 'info')], [Markup.button.callback('Помощь', 'help')]]

      if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback(BUTTONS.ADMIN_PANEL, 'admin')])
      }

      return ctx.reply(MESSAGES.MAIN_MENU, Markup.inlineKeyboard(buttons))
    })

    // Команды для событий
    this.bot.command('new_events', ctx => this.eventController.showUpcomingEvents(ctx))
    this.bot.command('my_events', ctx => this.eventController.showUserEvents(ctx))

    // Команда для получения Telegram ID
    this.bot.command('myid', ctx => {
      ctx.reply(`Ваш Telegram ID: \`${ctx.from!.id}\``, { parse_mode: 'Markdown' })
    })

    // Команда помощи
    this.bot.command('help', ctx => ctx.reply(MESSAGES.HELP_TEXT))
  }

  private setupScenes(): void {
    // Создаем упрощенные сцены
    const { createClubInfoScene } = require('../scenes/club-info.scene')
    const { createPaymentDetailsScene } = require('../scenes/payment-details.scene')
    const { createEventScene } = require('../scenes/create-event.scene')
    const { createEditEventScene } = require('../scenes/edit-event.scene')

    const clubInfoScene = createClubInfoScene(this.clubInfoService)
    const paymentDetailsScene = createPaymentDetailsScene(this.paymentDetailsService)
    const eventCreateScene = createEventScene(this.eventService)
    const eventEditScene = createEditEventScene(this.eventService)

    this.stage = new Scenes.Stage<BotContext>([clubInfoScene, paymentDetailsScene, eventCreateScene, eventEditScene])

    this.bot.use(session())
    this.bot.use(this.createUserMiddleware())
    this.bot.use(this.createSchedulePublishMiddleware())
    this.bot.use(this.stage.middleware())
  }

  private setupActions(): void {
    // Основные действия
    this.bot.action('main_menu', async ctx => {
      await ctx.answerCbQuery()

      const buttons = [[Markup.button.callback(BUTTONS.UPCOMING_EVENTS, 'new_events'), Markup.button.callback(BUTTONS.MY_EVENTS, 'my_events')], [Markup.button.callback('Отзывы', 'reviews'), Markup.button.callback('О клубе', 'info')], [Markup.button.callback('Помощь', 'help')]]

      if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback(BUTTONS.ADMIN_PANEL, 'admin')])
      }

      await ctx.editMessageText(MESSAGES.MAIN_MENU, Markup.inlineKeyboard(buttons))
    })
    this.bot.action('new_events', ctx => this.eventController.showUpcomingEvents(ctx))
    this.bot.action('my_events', ctx => this.eventController.showUserEvents(ctx))

    // Действия с событиями
    this.bot.action(/^event_details_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.eventController.showEventDetails(ctx, eventId)
    })

    this.bot.action(/^join_event_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.handleJoinEvent(ctx, eventId)
    })

    this.bot.action(/^leave_event_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.eventController.leaveEvent(ctx, eventId)
    })

    this.bot.action(/^payment_(onsite|advance|full)_(\d+)$/, ctx => {
      const paymentType = ctx.match[1]
      const eventId = parseInt(ctx.match[2])
      return this.eventController.updatePaymentChoice(ctx, eventId, paymentType)
    })

    // Переключение между типами событий
    this.bot.action(/^toggle_events(_past)?_my$/, ctx => {
      const isPast = ctx.match[1] === '_past'
      return this.eventController.showUserEvents(ctx, isPast)
    })

    // Админские действия
    this.bot.action('admin', ctx => this.adminController.showAdminPanel(ctx))
    this.bot.action('admin_events', ctx => this.adminController.showEventsMenu(ctx))
    this.bot.action('admin_upcoming_events', ctx => this.adminController.showEventsList(ctx, 'upcoming'))
    this.bot.action('admin_past_events', ctx => this.adminController.showEventsList(ctx, 'past'))
    this.bot.action('admin_all_events', ctx => this.adminController.showEventsList(ctx, 'all'))

    // Действия с событиями для админов
    this.bot.action(/^publish_event_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.adminController.publishEvent(ctx, eventId)
    })

    this.bot.action(/^schedule_publish_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.adminController.schedulePublish(ctx, eventId)
    })

    this.bot.action(/^edit_event_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.adminController.editEvent(ctx, eventId)
    })

    // Создание событий
    this.bot.action('create_event', ctx => this.adminController.createEvent(ctx))

    // Реквизиты для оплаты
    this.bot.action('payment_details', ctx => this.paymentDetailsController.showPaymentDetailsList(ctx))
    this.bot.action('add_payment_details', ctx => {
      return this.paymentDetailsController.createPaymentDetails(ctx)
    })
    this.bot.action('edit_payment_details', ctx => this.paymentDetailsController.showEditPaymentDetailsList(ctx))

    this.bot.action(/^delete_payment_details_(\d+)$/, ctx => {
      const detailsId = parseInt(ctx.match[1])
      return this.paymentDetailsController.confirmDeletePaymentDetails(ctx, detailsId)
    })

    this.bot.action(/^confirm_delete_payment_details_(\d+)$/, ctx => {
      const detailsId = parseInt(ctx.match[1])
      return this.paymentDetailsController.deletePaymentDetails(ctx, detailsId)
    })

    this.bot.action(/^edit_payment_details_(\d+)$/, ctx => {
      const detailsId = parseInt(ctx.match[1])
      return this.paymentDetailsController.editPaymentDetails(ctx, detailsId)
    })

    // Информация о клубе
    this.bot.action('info', ctx => this.clubInfoController.showClubInfo(ctx))
    this.bot.action('edit_club_info', ctx => this.clubInfoController.editClubInfo(ctx))

    // Система оплаты
    this.bot.action(/^pay_event_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.paymentDetailsController.showPaymentDetailsForPayment(ctx, eventId)
    })

    this.bot.action(/^select_payment_method_(\d+)_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      const detailsId = parseInt(ctx.match[2])
      return this.paymentDetailsController.showPaymentInstructions(ctx, eventId, detailsId)
    })

    this.bot.action(/^confirm_payment_(\d+)_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      const detailsId = parseInt(ctx.match[2])
      return this.handlePaymentConfirmation(ctx, eventId, detailsId)
    })

    this.bot.action(/^payment_received_(\d+)_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      const userId = parseInt(ctx.match[2])
      return this.adminController.confirmPayment(ctx, eventId, userId)
    })

    this.bot.action(/^check_payment_later_(\d+)_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      const userId = parseInt(ctx.match[2])
      return this.handlePaymentLater(ctx, eventId, userId)
    })

    // Обработчики для отмены участия и напоминания
    this.bot.action(/^cancel_join_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.handleCancelJoin(ctx, eventId)
    })

    this.bot.action(/^remind_later_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.handleRemindLater(ctx, eventId)
    })

    // Обработчики отзывов и помощи
    this.bot.action('reviews', ctx => {
      return ctx.answerCbQuery('Функция отзывов будет добавлена позже')
    })

    this.bot.action('help', ctx => {
      return ctx.reply(MESSAGES.HELP_TEXT)
    })

    // Действия с участниками в редактировании событий
    this.bot.action(/^view_participants_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.showEventParticipants(ctx, eventId)
    })

    this.bot.action(/^toggle_reg_date_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.toggleParticipantOption(ctx, eventId, 'showRegistrationDate')
    })

    this.bot.action(/^toggle_pay_date_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.toggleParticipantOption(ctx, eventId, 'showPaymentDate')
    })

    this.bot.action(/^toggle_telegram_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.toggleParticipantOption(ctx, eventId, 'showTelegramContact')
    })

    this.bot.action(/^refresh_participants_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.showEventParticipants(ctx, eventId)
    })

    // Действия с управлением участниками
    this.bot.action(/^toggle_attendance_(\d+)_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      const userId = parseInt(ctx.match[2])
      return this.toggleAttendanceStatus(ctx, eventId, userId)
    })

    this.bot.action(/^toggle_onsite_payment_(\d+)_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      const userId = parseInt(ctx.match[2])
      return this.toggleOnSitePaymentStatus(ctx, eventId, userId)
    })

    // Обработчики для отмены участия и дополнительной информации
    this.bot.action(/^cancel_participation_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.handleCancelParticipation(ctx, eventId)
    })

    this.bot.action(/^what_to_bring_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.showWhatToBring(ctx, eventId)
    })

    this.bot.action(/^how_to_get_there_(\d+)$/, ctx => {
      const eventId = parseInt(ctx.match[1])
      return this.showHowToGetThere(ctx, eventId)
    })
  }

  private async handleJoinEvent(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventDetails(eventId, ctx.from?.id)

      if (event.userParticipationStatus) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ALREADY_PARTICIPANT)
        return
      }

      // Сразу регистрируем пользователя с временным статусом PAYMENT_NOT_CHOSEN
      const userData = {
        username: ctx.from!.username,
        firstName: ctx.from!.first_name,
        lastName: ctx.from!.last_name,
      }

      await this.eventService.joinEvent(eventId, ctx.from!.id, ParticipationStatus.PAYMENT_NOT_CHOSEN, userData)
      await ctx.answerCbQuery('Вы зарегистрированы на встречу!')

      // Показываем варианты оплаты
      const now = new Date()
      const buttons = []

      if (event.allowOnSitePayment) {
        buttons.push([Markup.button.callback(`${BUTTONS.PAY_ON_SITE} (${event.fullPaymentAmount} грн)`, `payment_onsite_${event.id}`)])
      }

      if (event.advancePaymentAmount && event.advancePaymentDeadline && now < event.advancePaymentDeadline) {
        buttons.push([Markup.button.callback(`${BUTTONS.PAY_ADVANCE} (${event.advancePaymentAmount} грн)`, `payment_advance_${event.id}`)])
      }

      if (event.fullPaymentAmount && (!event.advancePaymentAmount || (event.advancePaymentDeadline && now >= event.advancePaymentDeadline))) {
        buttons.push([Markup.button.callback(`${BUTTONS.PAY_FULL} (${event.fullPaymentAmount} грн)`, `payment_full_${event.id}`)])
      }

      buttons.push([Markup.button.callback('❌ Отменить участие', `cancel_participation_${event.id}`)])

      const paymentText = `Выберите вариант оплаты для встречи "${event.title}":`

      await safeEditMessage(ctx, paymentText, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error handling join event:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private async handleCancelParticipation(ctx: BotContext, eventId: number): Promise<void> {
    try {
      await this.eventService.updateParticipationStatus(eventId, ctx.from!.id, ParticipationStatus.CANCELLED_NO_PAYMENT)
      await ctx.answerCbQuery('Участие отменено')
      await ctx.editMessageText('❌ Ваше участие в встрече отменено.', Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]))
    } catch (error) {
      console.error('Error canceling participation:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private async showWhatToBring(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventDetails(eventId, ctx.from?.id)

      if (!event.whatToBring) {
        await ctx.answerCbQuery('Информация не указана')
        return
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(`🎒 Что взять с собой:\n\n${event.whatToBring}`, Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'main_menu')]]))
    } catch (error) {
      console.error('Error showing what to bring:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private async showHowToGetThere(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventDetails(eventId, ctx.from?.id)

      if (!event.howToGetThere) {
        await ctx.answerCbQuery('Информация не указана')
        return
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(`🗺️ Как добраться:\n\n${event.howToGetThere}`, Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'main_menu')]]))
    } catch (error) {
      console.error('Error showing how to get there:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private async ensureCommandsAreSet(): Promise<void> {
    try {
      // Устанавливаем команды для всех пользователей
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: '🏠 Главное меню' },
        { command: 'new_events', description: '📅 Ближайшие встречи' },
        { command: 'my_events', description: '👥 Мои встречи' },
        { command: 'myid', description: '🆔 Мой Telegram ID' },
        { command: 'help', description: '❓ Помощь' },
      ])

      // Также устанавливаем команды для приватных чатов
      await this.bot.telegram.setMyCommands(
        [
          { command: 'start', description: '🏠 Главное меню' },
          { command: 'new_events', description: '📅 Ближайшие встречи' },
          { command: 'my_events', description: '👥 Мои встречи' },
          { command: 'myid', description: '🆔 Мой Telegram ID' },
          { command: 'help', description: '❓ Помощь' },
        ],
        { scope: { type: 'all_private_chats' } }
      )

      console.log('✅ Команды бота успешно установлены')
    } catch (error) {
      console.error('❌ Ошибка установки команд:', error)
      // Попробуем еще раз через 5 секунд
      setTimeout(() => {
        this.ensureCommandsAreSet().catch(console.error)
      }, 5000)
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Bot already initialized')
    }

    // Устанавливаем команды бота
    await this.ensureCommandsAreSet()

    this.isInitialized = true
    this.log('Bot initialized')
  }

  public async launchPolling(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot not initialized. Call init() first')
    }

    try {
      console.log('🔄 Вызываем bot.launch()...')

      // Запускаем polling
      this.bot
        .launch()
        .then(async () => {
          console.log('✅ Polling запущен в фоновом режиме')
          this.log('Bot started in polling mode')

          // Переустанавливаем команды после успешного запуска
          await this.ensureCommandsAreSet()

          // Периодически переустанавливаем команды (каждые 10 минут)
          setInterval(() => {
            this.ensureCommandsAreSet().catch(console.error)
          }, 10 * 60 * 1000)
        })
        .catch(error => {
          console.error('❌ Ошибка в фоновом polling:', error)
        })

      // Даем небольшую задержку для инициализации
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('✅ bot.launch() инициализирован успешно')
    } catch (error) {
      console.error('❌ Polling launch failed:', error)
      throw error
    }
  }

  public async launchWebhook(webhookUrl: string, port: number = 3000): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot not initialized. Call init() first')
    }

    try {
      await this.bot.telegram.setWebhook(webhookUrl)
      await this.bot.launch({
        webhook: {
          domain: webhookUrl,
          port: port,
        },
      })
      this.log(`Bot started in webhook mode on ${webhookUrl}`)
    } catch (error) {
      console.error('Webhook launch failed:', error)
      throw error
    }
  }

  public stop(reason?: string): void {
    if (reason) {
      console.log(`Stopping bot: ${reason}`)
    }
    this.bot.stop()
  }

  private async handlePaymentConfirmation(ctx: BotContext, eventId: number, detailsId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventById(eventId)
      if (!event) {
        await ctx.answerCbQuery(MESSAGES.ERROR_EVENT_NOT_FOUND)
        return
      }

      // Устанавливаем статус ожидания подтверждения оплаты
      await this.eventService.setPaymentConfirmation(eventId, ctx.from!.id)

      // Отправляем уведомление админу по оплатам
      try {
        await this.bot.telegram.sendMessage(PAYMENT_ADMIN_ID, `🔔 Новое уведомление об оплате!\n\nПользователь ${ctx.from!.first_name} (${ctx.from!.username ? '@' + ctx.from!.username : 'без username'}) подтвердил оплату за встречу "${event.title}".\n\nПожалуйста, проверьте оплату и подтвердите её.`, Markup.inlineKeyboard([[Markup.button.callback('✅ Оплата пришла', `payment_received_${eventId}_${ctx.from!.id}`)], [Markup.button.callback('⏰ Позже', `check_payment_later_${eventId}_${ctx.from!.id}`)]]))
      } catch (error) {
        console.error('Error sending notification to payment admin:', error)
      }

      await ctx.answerCbQuery('Ваша оплата ожидает подтверждения администратором')
      await ctx.editMessageText(`✅ Спасибо, ${ctx.from!.first_name}! Мы получили Ваше подтверждение об оплате.\n\nМакс скоро проверит оплату и подтвердит ваше участие.\nВы получите уведомление, когда это произойдет.`, Markup.inlineKeyboard([[Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
    } catch (error) {
      console.error('Error handling payment confirmation:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private async handlePaymentLater(ctx: BotContext, eventId: number, userId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('У вас нет прав для этого действия')
      return
    }

    try {
      const event = await this.eventService.getEventById(eventId)
      const user = await this.userRepository.findOrCreateByTelegramId(userId)

      if (!event || !user) {
        await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
        return
      }

      // Отправляем то же сообщение через 2 минуты
      setTimeout(async () => {
        try {
          await this.bot.telegram.sendMessage(PAYMENT_ADMIN_ID, `🔔 Напоминание о проверке оплаты!\n\nПользователь ${user.firstName} (${user.username ? '@' + user.username : 'без username'}) подтвердил оплату за встречу "${event.title}".\n\nПожалуйста, проверьте оплату и подтвердите её.`, Markup.inlineKeyboard([[Markup.button.callback('✅ Оплата пришла', `payment_received_${eventId}_${userId}`)], [Markup.button.callback('⏰ Позже', `check_payment_later_${eventId}_${userId}`)]]))
        } catch (error) {
          console.error('Error sending reminder to payment admin:', error)
        }
      }, 2 * 60 * 1000) // 2 минуты

      await ctx.answerCbQuery('Напоминание будет отправлено через 2 минуты')
    } catch (error) {
      console.error('Error handling payment later:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  private async handleCancelJoin(ctx: BotContext, eventId: number): Promise<void> {
    await ctx.answerCbQuery()
    await ctx.editMessageText('Регистрация отменена', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к списку встреч', 'new_events')]]))
  }

  private async handleRemindLater(ctx: BotContext, eventId: number): Promise<void> {
    await ctx.answerCbQuery('Мы напомним вам об оплате позже')
    await ctx.editMessageText('Мы напомним вам об оплате позже. Вы можете вернуться к списку встреч.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к списку встреч', 'new_events')]]))
  }

  // Методы для работы с участниками
  private async showEventParticipants(ctx: BotContext, eventId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('У вас нет прав для этого действия')
      return
    }

    try {
      const event = await this.eventService.getEventDetails(eventId)
      if (!event) {
        await ctx.answerCbQuery('Событие не найдено')
        return
      }

      // Получаем настройки отображения и данные о посещении из сессии
      const session = ctx.session as any
      const participantViewOptions = session.participantViewOptions || {
        showRegistrationDate: false,
        showPaymentDate: false,
        showTelegramContact: false,
      }

      // Инициализируем карту данных о посещении, если её нет
      if (!session.attendanceData) {
        session.attendanceData = new Map()
      }

      const participantsText = MessageFormatter.formatParticipantsDetailed(event.participants, participantViewOptions, session.attendanceData)

      // Создаем кнопки управления участниками
      const managementButtons = MessageFormatter.createParticipantManagementButtons(eventId, event.participants, session.attendanceData)

      // Создаем кнопки переключения опций просмотра
      const toggleButtons = MessageFormatter.createParticipantViewToggleButtons(eventId, participantViewOptions)

      // Объединяем все кнопки
      const allButtons = [...managementButtons, ...toggleButtons]

      await ctx.answerCbQuery()
      await ctx.editMessageText(`📅 ${event.title}\n\n${participantsText}`, Markup.inlineKeyboard(allButtons))
    } catch (error) {
      console.error('Error showing event participants:', error)
      await ctx.answerCbQuery('Ошибка при загрузке участников')
    }
  }

  private async toggleParticipantOption(ctx: BotContext, eventId: number, optionName: string): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('У вас нет прав для этого действия')
      return
    }

    try {
      // Инициализируем или получаем настройки отображения из сессии
      const session = ctx.session as any
      if (!session.participantViewOptions) {
        session.participantViewOptions = {
          showRegistrationDate: false,
          showPaymentDate: false,
          showTelegramContact: false,
        }
      }

      // Переключаем опцию
      session.participantViewOptions[optionName] = !session.participantViewOptions[optionName]

      // Обновляем отображение
      await this.showEventParticipants(ctx, eventId)
    } catch (error) {
      console.error('Error toggling participant option:', error)
      await ctx.answerCbQuery('Ошибка при переключении опции')
    }
  }

  // Метод для переключения статуса посещения
  private async toggleAttendanceStatus(ctx: BotContext, eventId: number, userId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('У вас нет прав для этого действия')
      return
    }

    try {
      const session = ctx.session as any
      if (!session.attendanceData) {
        session.attendanceData = new Map()
      }

      // Получаем текущий статус или устанавливаем по умолчанию
      const currentData = session.attendanceData.get(userId) || {
        attendance: AttendanceStatus.UNKNOWN,
      }

      // Переключаем на следующий статус
      const newAttendance = MessageFormatter.getNextAttendanceStatus(currentData.attendance)

      session.attendanceData.set(userId, {
        ...currentData,
        attendance: newAttendance,
      })

      // Обновляем отображение
      await this.showEventParticipants(ctx, eventId)
    } catch (error) {
      console.error('Error toggling attendance status:', error)
      await ctx.answerCbQuery('Ошибка при изменении статуса посещения')
    }
  }

  // Метод для переключения статуса оплаты на месте
  private async toggleOnSitePaymentStatus(ctx: BotContext, eventId: number, userId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery('У вас нет прав для этого действия')
      return
    }

    try {
      const session = ctx.session as any
      if (!session.attendanceData) {
        session.attendanceData = new Map()
      }

      // Получаем текущие данные
      const currentData = session.attendanceData.get(userId) || {
        attendance: AttendanceStatus.UNKNOWN,
        onSitePayment: OnSitePaymentStatus.NOT_PAID,
      }

      // Переключаем статус оплаты
      const newPaymentStatus = currentData.onSitePayment === OnSitePaymentStatus.NOT_PAID ? OnSitePaymentStatus.PAID : OnSitePaymentStatus.NOT_PAID

      session.attendanceData.set(userId, {
        ...currentData,
        onSitePayment: newPaymentStatus,
      })

      // Обновляем отображение
      await this.showEventParticipants(ctx, eventId)
    } catch (error) {
      console.error('Error toggling onsite payment status:', error)
      await ctx.answerCbQuery('Ошибка при изменении статуса оплаты')
    }
  }

  private log(message: string, data?: any): void {
    if (this.config.verbose) {
      if (data) {
        console.log(`[BOT] ${message}`, data)
      } else {
        console.log(`[BOT] ${message}`)
      }
    }
  }
}
