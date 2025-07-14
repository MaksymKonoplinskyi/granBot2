# Дальнейшие улучшения архитектуры

## 🔄 Паттерны для внедрения

### 1. **Strategy Pattern для обработки платежей**

```typescript
interface PaymentStrategy {
  processPayment(amount: number, userId: number): Promise<PaymentResult>
}

class OnSitePaymentStrategy implements PaymentStrategy {
  async processPayment(amount: number, userId: number): Promise<PaymentResult> {
    // Логика оплаты на месте
  }
}

class AdvancePaymentStrategy implements PaymentStrategy {
  async processPayment(amount: number, userId: number): Promise<PaymentResult> {
    // Логика предварительной оплаты
  }
}
```

### 2. **Factory Pattern для создания сцен**

```typescript
class SceneFactory {
  static createEventWizard(): Scenes.WizardScene<BotContext> {
    // Создание сцены создания события
  }

  static createPaymentWizard(): Scenes.WizardScene<BotContext> {
    // Создание сцены оплаты
  }
}
```

### 3. **Observer Pattern для уведомлений**

```typescript
interface EventObserver {
  onEventCreated(event: Event): Promise<void>
  onEventPublished(event: Event): Promise<void>
  onUserJoined(event: Event, user: User): Promise<void>
}

class NotificationService implements EventObserver {
  async onEventCreated(event: Event): Promise<void> {
    // Уведомление о создании события
  }

  async onEventPublished(event: Event): Promise<void> {
    // Уведомление о публикации события
  }
}
```

### 4. **Builder Pattern для создания сообщений**

```typescript
class MessageBuilder {
  private message = ''

  addTitle(title: string): MessageBuilder {
    this.message += `📅 ${title}\n\n`
    return this
  }

  addDescription(description: string): MessageBuilder {
    this.message += `📝 ${description}\n\n`
    return this
  }

  addDate(label: string, date: Date): MessageBuilder {
    this.message += `🕒 ${label}: ${DateFormatter.formatDate(date)}\n`
    return this
  }

  build(): string {
    return this.message
  }
}
```

## 🧪 Тестирование

### 1. **Unit тесты**

```typescript
// tests/services/event.service.spec.ts
describe('EventService', () => {
  let eventService: EventService
  let mockEventRepository: jest.Mocked<EventRepository>
  let mockUserRepository: jest.Mocked<UserRepository>

  beforeEach(() => {
    mockEventRepository = createMockEventRepository()
    mockUserRepository = createMockUserRepository()
    eventService = new EventService(mockEventRepository, mockUserRepository)
  })

  describe('createEvent', () => {
    it('should create event successfully', async () => {
      // Тест создания события
    })
  })
})
```

### 2. **Integration тесты**

```typescript
// tests/controllers/event.controller.spec.ts
describe('EventController', () => {
  let controller: EventController
  let mockContext: jest.Mocked<BotContext>

  beforeEach(() => {
    controller = new EventController(mockEventService)
    mockContext = createMockBotContext()
  })

  it('should show upcoming events', async () => {
    // Тест показа предстоящих событий
  })
})
```

## 🔧 Middleware

### 1. **Logging Middleware**

```typescript
class LoggingMiddleware {
  static create(logger: Logger) {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      const start = Date.now()
      logger.info(`Incoming ${ctx.updateType} from ${ctx.from?.id}`)

      await next()

      const duration = Date.now() - start
      logger.info(`Processed in ${duration}ms`)
    }
  }
}
```

### 2. **Rate Limiting Middleware**

```typescript
class RateLimitMiddleware {
  private static requests = new Map<number, number[]>()

  static create(maxRequests: number, windowMs: number) {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      const userId = ctx.from?.id
      if (!userId) return next()

      const now = Date.now()
      const userRequests = this.requests.get(userId) || []

      // Очищаем старые запросы
      const validRequests = userRequests.filter(time => now - time < windowMs)

      if (validRequests.length >= maxRequests) {
        await ctx.reply('Слишком много запросов. Попробуйте позже.')
        return
      }

      validRequests.push(now)
      this.requests.set(userId, validRequests)

      await next()
    }
  }
}
```

## 📊 Мониторинг и метрики

### 1. **Metrics Service**

```typescript
class MetricsService {
  private static instance: MetricsService
  private metrics = new Map<string, number>()

  static getInstance(): MetricsService {
    if (!this.instance) {
      this.instance = new MetricsService()
    }
    return this.instance
  }

  increment(metric: string): void {
    const current = this.metrics.get(metric) || 0
    this.metrics.set(metric, current + 1)
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics)
  }
}
```

### 2. **Health Check**

```typescript
class HealthCheckService {
  async checkHealth(): Promise<HealthStatus> {
    return {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        database: await this.checkDatabase(),
        telegram: await this.checkTelegram(),
        memory: this.checkMemory(),
      },
    }
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    // Проверка подключения к базе данных
  }

  private async checkTelegram(): Promise<ServiceStatus> {
    // Проверка Telegram API
  }
}
```

## 🌟 Дополнительные возможности

### 1. **Кэширование**

```typescript
class CacheService {
  private cache = new Map<string, { data: any; expiry: number }>()

  async get<T>(key: string): Promise<T | null> {
    const cached = this.cache.get(key)
    if (!cached || cached.expiry < Date.now()) {
      this.cache.delete(key)
      return null
    }
    return cached.data
  }

  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    })
  }
}
```

### 2. **Локализация**

```typescript
class LocalizationService {
  private translations = new Map<string, Map<string, string>>()

  t(key: string, locale: string = 'ru'): string {
    const localeTranslations = this.translations.get(locale)
    return localeTranslations?.get(key) || key
  }

  loadTranslations(locale: string, translations: Record<string, string>): void {
    this.translations.set(locale, new Map(Object.entries(translations)))
  }
}
```

### 3. **Конфигурация**

```typescript
class ConfigService {
  private config: BotConfig

  constructor() {
    this.config = {
      token: process.env.BOT_TOKEN!,
      verbose: process.env.NODE_ENV === 'development',
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USERNAME!,
        password: process.env.DB_PASSWORD!,
        database: process.env.DB_NAME!,
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }
  }

  get(key: keyof BotConfig): any {
    return this.config[key]
  }
}
```

## 🚀 Деплой и DevOps

### 1. **Docker**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

USER node

CMD ["npm", "start"]
```

### 2. **Docker Compose**

```yaml
version: '3.8'
services:
  bot:
    build: .
    environment:
      - NODE_ENV=production
      - BOT_TOKEN=${BOT_TOKEN}
      - DB_HOST=postgres
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14
    environment:
      - POSTGRES_DB=bot
      - POSTGRES_USER=bot
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
```

### 3. **CI/CD Pipeline**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        # Деплой в продакшен
```

## 📝 Документация

### 1. **API Documentation**

```typescript
/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Получить список событий
 *     parameters:
 *       - name: upcoming
 *         in: query
 *         description: Показать только предстоящие события
 *         required: false
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Список событий
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Event'
 */
```

### 2. **README.md**

````markdown
# Telegram Bot для управления встречами

## Архитектура

- **Controllers** - обработка команд и действий
- **Services** - бизнес-логика
- **Repositories** - работа с данными
- **DTOs** - объекты передачи данных
- **Utils** - вспомогательные функции

## Установка

```bash
npm install
npm run build
npm start
```
````

## Тестирование

```bash
npm test
npm run test:watch
npm run test:coverage
```

```

Данная архитектура решает все основные проблемы исходного кода и предоставляет основу для дальнейшего развития проекта.
```
