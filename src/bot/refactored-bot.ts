import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { DataSource } from 'typeorm'
import { BotContext, BotConfig } from '../types/bot.types'
import { EventService } from '../services/event.service'
import { EventRepository } from '../repositories/event.repository'
import { UserRepository } from '../repositories/user.repository'
import { EventController } from '../controllers/event.controller'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'

export class RefactoredTelegramBot {
  private readonly bot: Telegraf<BotContext>
  private readonly eventService: EventService
  private readonly eventController: EventController
  private isInitialized = false
  private stage!: Scenes.Stage<BotContext>

  constructor(private readonly config: BotConfig, private readonly dataSource: DataSource) {
    this.bot = new Telegraf<BotContext>(config.token)

    // Dependency injection
    const eventRepository = new EventRepository(dataSource)
    const userRepository = new UserRepository(dataSource)
    this.eventService = new EventService(eventRepository, userRepository)
    this.eventController = new EventController(this.eventService)

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
    // Здесь можно добавить сцены для создания/редактирования событий
    // Пример минимальной настройки
    this.stage = new Scenes.Stage<BotContext>([])
    this.bot.use(session())
    this.bot.use(this.stage.middleware())
  }

  private setupActions(): void {
    // Основные действия
    this.bot.action('main_menu', this.handleMainMenu.bind(this))
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
    this.bot.action('admin', this.handleAdminPanel.bind(this))
  }

  private async handleMainMenu(ctx: BotContext): Promise<void> {
    await ctx.answerCbQuery()

    const buttons = [[Markup.button.callback(BUTTONS.UPCOMING_EVENTS, 'new_events'), Markup.button.callback(BUTTONS.MY_EVENTS, 'my_events')], [Markup.button.callback('Отзывы', 'reviews'), Markup.button.callback('О клубе', 'info')], [Markup.button.callback('Помощь', 'help')]]

    if (isAdmin(ctx.from?.id)) {
      buttons.push([Markup.button.callback(BUTTONS.ADMIN_PANEL, 'admin')])
    }

    await ctx.editMessageText(MESSAGES.MAIN_MENU, Markup.inlineKeyboard(buttons))
  }

  private async handleAdminPanel(ctx: BotContext): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    await ctx.answerCbQuery()
    await ctx.editMessageText(MESSAGES.ADMIN_PANEL, Markup.inlineKeyboard([[Markup.button.callback('📋 Встречи', 'admin_events'), Markup.button.callback(BUTTONS.CREATE_EVENT, 'create_event')], [Markup.button.callback('💳 Реквизиты для оплаты', 'payment_details')], [Markup.button.callback('ℹ️ О клубе', 'info')], [Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]))
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
