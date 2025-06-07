import { TelegramBot } from './bot/bot';
import dotenv from 'dotenv';

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN!);

if (process.env.NODE_ENV === 'production') {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot`;
  bot.launchWebhook(webhookUrl);
} else {
  bot.launchPolling();
}