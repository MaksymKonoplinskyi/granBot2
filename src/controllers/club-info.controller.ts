import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { ClubInfoService } from '../services/club-info.service'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'
import { safeEditMessage, safeEditOrReply, replaceMessage } from '../utils/message-utils'

export class ClubInfoController {
  constructor(private clubInfoService: ClubInfoService) {}

  async showClubInfo(ctx: BotContext): Promise<void> {
    try {
      const clubInfoText = await this.clubInfoService.getClubInfoOrDefault()

      const buttons = [[Markup.button.callback(BUTTONS.MAIN_MENU, 'main_menu')]]

      if (isAdmin(ctx.from?.id)) {
        buttons.push([Markup.button.callback('✏️ Редактировать', 'edit_club_info')])
      }

      await replaceMessage(ctx, clubInfoText, Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing club info:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async updateClubInfo(ctx: BotContext, description: string): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      await this.clubInfoService.updateClubInfo(description)

      await replaceMessage(ctx, '✅ Информация о клубе успешно обновлена!', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'info')]]))
    } catch (error) {
      console.error('Error updating club info:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async editClubInfo(ctx: BotContext): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
        return
      }

      await ctx.answerCbQuery()
      await ctx.scene.enter('club-info-edit')
    } catch (error) {
      console.error('Error in editClubInfo:', error)
      await ctx.answerCbQuery('Ошибка при редактировании информации о клубе')
    }
  }
}
