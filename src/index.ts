const { Telegraf } = require('telegraf');
import { Context } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx: Context) => ctx.reply('Добро пожаловать!'));
bot.help((ctx: Context) => ctx.reply('Отправь мне любое сообщение'));
bot.on('text', (ctx: Context) => {
  if (ctx.message && 'text' in ctx.message) {
    ctx.reply('Вы написали: ' + (ctx.message as { text: string }).text);
  }
});

bot.launch();