import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { ClubInfoService } from '../services/club-info.service'
import { MESSAGES } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'

export const createClubInfoScene = (clubInfoService: ClubInfoService) => {
  const scene = new Scenes.BaseScene<BotContext>('club-info-edit')

  scene.enter(async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      const currentInfo = await clubInfoService.getClubInfoOrDefault()

      await ctx.reply(`Текущая информация о клубе:\n\n${currentInfo}\n\nВведите новую информацию о клубе:`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
    } catch (error) {
      console.error('Error entering club info scene:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  scene.on('text', async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      const newInfo = ctx.message.text
      await clubInfoService.updateClubInfo(newInfo)

      await ctx.reply('✅ Информация о клубе успешно обновлена!', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к информации о клубе', 'info')]]))

      return ctx.scene.leave()
    } catch (error) {
      console.error('Error updating club info:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  scene.action('cancel_edit', async ctx => {
    await ctx.answerCbQuery()
    await ctx.reply('Редактирование отменено')
    return ctx.scene.leave()
  })

  scene.action('info', async ctx => {
    await ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  return scene
}
