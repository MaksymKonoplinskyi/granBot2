import { Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { PaymentDetailsService } from '../services/payment-details.service'
import { MESSAGES, BUTTONS } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'

export class PaymentDetailsController {
  constructor(private paymentDetailsService: PaymentDetailsService) {}

  async showPaymentDetailsList(ctx: BotContext): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      const paymentDetails = await this.paymentDetailsService.getAllPaymentDetails()

      let message = 'Реквизиты для оплаты:\n\n'

      if (paymentDetails.length === 0) {
        message += 'Реквизиты еще не добавлены.'
      } else {
        paymentDetails.forEach((details, index) => {
          message += `${index + 1}. ${details.title}\n${details.description}\n\n`
        })
      }

      await ctx.editMessageText(message, Markup.inlineKeyboard([[Markup.button.callback('➕ Добавить реквизиты', 'add_payment_details')], [Markup.button.callback('✏️ Редактировать реквизиты', 'edit_payment_details')], [Markup.button.callback('◀️ Назад', 'admin')]]))
    } catch (error) {
      console.error('Error showing payment details:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async showEditPaymentDetailsList(ctx: BotContext): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      const paymentDetails = await this.paymentDetailsService.getAllPaymentDetails()

      if (paymentDetails.length === 0) {
        await ctx.answerCbQuery('Нет сохраненных реквизитов')
        return
      }

      const buttons = paymentDetails.map(details => [Markup.button.callback(details.title, `edit_payment_details_${details.id}`), Markup.button.callback('🗑', `delete_payment_details_${details.id}`)])

      buttons.push([Markup.button.callback('◀️ Назад', 'payment_details')])

      await ctx.editMessageText('Выберите реквизиты для редактирования или удаления:', Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing edit payment details list:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
    }
  }

  async confirmDeletePaymentDetails(ctx: BotContext, detailsId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      const details = await this.paymentDetailsService.getPaymentDetailsById(detailsId)

      await ctx.editMessageText(`Вы уверены, что хотите удалить реквизиты "${details.title}"?`, Markup.inlineKeyboard([[Markup.button.callback('✅ Да', `confirm_delete_payment_details_${detailsId}`)], [Markup.button.callback('❌ Нет', 'edit_payment_details')]]))
    } catch (error) {
      console.error('Error showing delete confirmation:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async deletePaymentDetails(ctx: BotContext, detailsId: number): Promise<void> {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
      return
    }

    try {
      await this.paymentDetailsService.deletePaymentDetails(detailsId)
      await ctx.answerCbQuery('Реквизиты успешно удалены')

      // Возвращаемся к списку реквизитов
      await this.showPaymentDetailsList(ctx)
    } catch (error) {
      console.error('Error deleting payment details:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async showPaymentDetailsForPayment(ctx: BotContext, eventId: number): Promise<void> {
    try {
      const paymentDetails = await this.paymentDetailsService.getAllPaymentDetails()

      if (paymentDetails.length === 0) {
        await ctx.answerCbQuery('Нет доступных способов оплаты')
        return
      }

      const buttons = paymentDetails.map(details => [Markup.button.callback(details.title, `select_payment_method_${eventId}_${details.id}`)])

      buttons.push([Markup.button.callback('◀️ Назад', `event_${eventId}`)])

      await ctx.editMessageText('Выберите способ оплаты:', Markup.inlineKeyboard(buttons))
    } catch (error) {
      console.error('Error showing payment methods:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async showPaymentInstructions(ctx: BotContext, eventId: number, detailsId: number): Promise<void> {
    try {
      const paymentDetails = await this.paymentDetailsService.getPaymentDetailsById(detailsId)

      await ctx.editMessageText(`Информация для оплаты:\n\n${paymentDetails.description}\n\nПосле оплаты нажмите кнопку "Я оплатил"`, Markup.inlineKeyboard([[Markup.button.callback('✅ Я оплатил', `confirm_payment_${eventId}_${detailsId}`)], [Markup.button.callback('◀️ Назад', `pay_event_${eventId}`)]]))
    } catch (error) {
      console.error('Error showing payment instructions:', error)
      await ctx.answerCbQuery(MESSAGES.ERROR_GENERAL)
    }
  }

  async createPaymentDetails(ctx: BotContext): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
        return
      }

      await ctx.answerCbQuery()
      await ctx.scene.enter('payment-details-edit')
    } catch (error) {
      console.error('Error in createPaymentDetails:', error)
      await ctx.answerCbQuery('Ошибка при создании реквизитов')
    }
  }

  async editPaymentDetails(ctx: BotContext, detailsId: number): Promise<void> {
    try {
      if (!isAdmin(ctx.from?.id)) {
        await ctx.answerCbQuery(MESSAGES.ERROR_ACCESS_DENIED)
        return
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText('Редактирование реквизитов временно недоступно через упрощенный интерфейс.\n' + 'Используйте полную админ-панель для редактирования реквизитов.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к реквизитам', 'edit_payment_details')]]))
    } catch (error) {
      console.error('Error in editPaymentDetails:', error)
      await ctx.answerCbQuery('Ошибка при редактировании реквизитов')
    }
  }
}
