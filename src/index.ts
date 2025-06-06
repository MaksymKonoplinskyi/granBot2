const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => ctx.reply('Добро пожаловать!'));
bot.help((ctx) => ctx.reply('Отправь мне любое сообщение'));
bot.on('text', (ctx) => ctx.reply('Вы написали: ' + ctx.message.text));

bot.launch();