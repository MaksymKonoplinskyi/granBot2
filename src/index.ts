import { TelegramBot } from './bot/bot';
import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import express from 'express';
dotenv.config();

const requiredEnvVars = ['BOT_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

(async () => {
  try {
    const bot = new TelegramBot(process.env.BOT_TOKEN!);
    bot.init([]);

    if (process.env.NODE_ENV === 'production') {
      if (!process.env.RENDER_EXTERNAL_URL) {
        throw new Error('RENDER_EXTERNAL_URL is required in production');
      }
      const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot`;
      const port = Number(process.env.PORT || 3000);

      // Создаём express-приложение
      const app = express();
      app.use(bot.getWebhookCallback('/bot')); // реализуйте этот метод в TelegramBot

      // Устанавливаем webhook
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

