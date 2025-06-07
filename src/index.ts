import { TelegramBot } from './bot/bot';
import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';

dotenv.config();

const requiredEnvVars = ['BOT_TOKEN'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

try {
  const bot = new TelegramBot(process.env.BOT_TOKEN!);
  bot.init([]);
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.RENDER_EXTERNAL_URL) {
      throw new Error('RENDER_EXTERNAL_URL is required in production');
    }
    const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot`;
    console.log(`Starting webhook at ${webhookUrl}`);
    bot.launchWebhook(process.env.RENDER_EXTERNAL_URL + '/bot', Number(process.env.PORT || 3000));
  } else {
    console.log('Starting in polling mode');
    bot.launchPolling();
  }
  
  console.log('Bot started successfully');
} catch (error) {
  console.error('Failed to start bot:', error);
  process.exit(1);
}

