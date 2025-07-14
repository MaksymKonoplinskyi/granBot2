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

export class RefactoredTelegramBot {
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

    this.eventController = new EventController(this.eventService)
    this.adminController = new AdminController(this.eventService, this.paymentDetailsService, this.clubInfoService)
    this.paymentDetailsController = new PaymentDetailsController(this.paymentDetailsService)
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

  private setupCommands(): void {
    // Устанавливаем меню команд
    this.bot.telegram.setMyCommands([
      { command: 'start', description: '🏠 Главное меню' },
      { command: 'new_events', description: '📅 Ближайшие встречи' },
      { command: 'my_events', description: '👥 Мои встречи' },
      { command: 'help', description: '❓ Помощь' },
    ])

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

    // Команда помощи
    this.bot.command('help', ctx => ctx.reply(MESSAGES.HELP_TEXT))
  }

  private setupScenes(): void {
    // Создаем упрощенные сцены
    const { createClubInfoScene } = require('../scenes/club-info.scene')
    const { createPaymentDetailsScene } = require('../scenes/payment-details.scene')

    const clubInfoScene = createClubInfoScene(this.clubInfoService)
    const paymentDetailsScene = createPaymentDetailsScene(this.paymentDetailsService)

    this.stage = new Scenes.Stage<BotContext>([clubInfoScene, paymentDetailsScene])

    this.bot.use(session())
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

    this.bot.action(/^payment_(\w+)_(\d+)$/, ctx => {
      const paymentType = ctx.match[1]
      const eventId = parseInt(ctx.match[2])
      return this.eventController.joinEvent(ctx, eventId, paymentType)
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
  }

  private async handleJoinEvent(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const event = await this.eventService.getEventDetails(eventId, ctx.from?.id)

      if (event.userParticipationStatus) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ALREADY_PARTICIPANT)
        return
      }

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

      buttons.push([Markup.button.callback('❌ Отменить', `event_details_${event.id}`)])

      await ctx.editMessageText(`Выберите вариант оплаты для встречи "${event.title}":`, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error handling join event:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Bot already initialized')
    }

    this.isInitialized = true
    this.log('Bot initialized')
  }

  public async launchPolling(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Bot not initialized. Call init() first')
    }

    try {
      await this.bot.launch()
      this.log('Bot started in polling mode')
    } catch (error) {
      console.error('Polling launch failed:', error)
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

      // Отправляем уведомления админам
      const ADMINS = ['123456789'] // TODO: Вынести в конфиг
      for (const adminId of ADMINS) {
        try {
          await this.bot.telegram.sendMessage(adminId, `🔔 Новое уведомление об оплате!\n\nПользователь ${ctx.from!.first_name} (${ctx.from!.username ? '@' + ctx.from!.username : 'без username'}) подтвердил оплату за встречу "${event.title}".\n\nПожалуйста, проверьте оплату и подтвердите её.`, Markup.inlineKeyboard([[Markup.button.callback('✅ Оплата пришла', `payment_received_${eventId}_${ctx.from!.id}`)], [Markup.button.callback('⏰ Позже', `check_payment_later_${eventId}_${ctx.from!.id}`)]]))
        } catch (error) {
          console.error('Error sending notification to admin:', error)
        }
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
      const user = await this.userRepository.findByTelegramId(userId)

      if (!event || !user) {
        await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
        return
      }

      // Отправляем то же сообщение через 2 минуты
      setTimeout(async () => {
        try {
          await this.bot.telegram.sendMessage(ctx.from!.id, `🔔 Напоминание о проверке оплаты!\n\nПользователь ${user.firstName} (${user.username ? '@' + user.username : 'без username'}) подтвердил оплату за встречу "${event.title}".\n\nПожалуйста, проверьте оплату и подтвердите её.`, Markup.inlineKeyboard([[Markup.button.callback('✅ Оплата пришла', `payment_received_${eventId}_${userId}`)], [Markup.button.callback('⏰ Позже', `check_payment_later_${eventId}_${userId}`)]]))
        } catch (error) {
          console.error('Error sending reminder to admin:', error)
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
