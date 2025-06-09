import { TelegramBot } from './bot/bot';
import dotenv from 'dotenv';
import express from 'express';
import { getDataSource } from './data-source';
import { DataSource } from 'typeorm';

dotenv.config();

const requiredEnvVars = ['BOT_TOKEN', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Определяем режим логирования
const verbose = process.env.VERBOSE_LOGGING === 'true';

let bot: TelegramBot;
let dataSource: DataSource;

// Функция для корректного завершения работы
async function gracefulShutdown(signal: string) {
  console.log(`\nПолучен сигнал ${signal}. Завершаем работу...`);
  
  if (bot) {
    bot.stop('Получен сигнал завершения');
  }
  
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    console.log('Соединение с базой данных закрыто');
  }
  
  process.exit(0);
}

// Регистрируем обработчики сигналов
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

(async () => {
  try {
    // Инициализируем подключение к базе данных
    if (verbose) {
      console.log(`DB_HOST: ${process.env.DB_HOST}`);
      console.log(`DB_PORT: ${process.env.DB_PORT}`);
      console.log(`DB_USER: ${process.env.DB_USER}`);
      console.log(`DB_PASS length: ${process.env.DB_PASS?.length} (не показываем сам пароль для безопасности)`);
      console.log(`DB_NAME: ${process.env.DB_NAME}`);
    }

    dataSource = getDataSource(verbose);
    await dataSource.initialize();
    console.log('Data Source has been initialized!');

    bot = new TelegramBot(process.env.BOT_TOKEN!, dataSource, { verbose });
    bot.init([]);
    bot.addAdminFeatures()
    bot.addStartMenu();

    if (process.env.NODE_ENV === 'production') {
      if (!process.env.RENDER_EXTERNAL_URL) {
        throw new Error('RENDER_EXTERNAL_URL is required in production');
      }
      const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot`;
      const port = Number(process.env.PORT || 3000);

      const app = express();
      app.use(bot.getWebhookCallback('/bot'));

      await bot.setWebhook(webhookUrl);

      app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
      });
    } else {
      console.log('Starting in polling mode');
      await bot.launchPolling();
    }
    console.log('Bot started successfully');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
})();

