import { Scenes, Markup } from 'telegraf'
import { BotContext } from '../types/bot.types'
import { PaymentDetailsService } from '../services/payment-details.service'
import { MESSAGES } from '../constants/messages'
import { isAdmin } from '../utils/auth.utils'

interface PaymentDetailsSceneState {
  step: 'title' | 'description'
  title?: string
  editingId?: number
}

export const createPaymentDetailsScene = (paymentDetailsService: PaymentDetailsService) => {
  const scene = new Scenes.BaseScene<BotContext>('payment-details-edit')

  scene.enter(async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    // Инициализируем состояние сцены
    ctx.session = ctx.session || {}
    ;(ctx.session as any).paymentDetailsState = {
      step: 'title',
    }

    await ctx.reply('Добавление новых реквизитов для оплаты.\n\nШаг 1/2: Введите название реквизитов (например: "Банковская карта", "PayPal", "WebMoney"):', Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
  })

  scene.on('text', async ctx => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply(MESSAGES.ERROR_ACCESS_DENIED)
      return ctx.scene.leave()
    }

    try {
      const state = (ctx.session as any)?.paymentDetailsState as PaymentDetailsSceneState

      if (state.step === 'title') {
        state.title = ctx.message.text
        state.step = 'description'

        await ctx.reply(`Название: ${state.title}\n\nШаг 2/2: Введите описание реквизитов (номер карты, реквизиты для перевода и т.д.):`, Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_edit')]]))
      } else if (state.step === 'description') {
        const description = ctx.message.text

        await paymentDetailsService.createPaymentDetails({
          title: state.title!,
          description,
        })

        await ctx.reply('✅ Реквизиты успешно добавлены!', Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад к реквизитам', 'payment_details')]]))

        return ctx.scene.leave()
      }
    } catch (error) {
      console.error('Error in payment details scene:', error)
      await ctx.reply(MESSAGES.ERROR_GENERAL)
      return ctx.scene.leave()
    }
  })

  scene.action('cancel_edit', async ctx => {
    await ctx.answerCbQuery()
    await ctx.reply('Добавление реквизитов отменено')
    return ctx.scene.leave()
  })

  scene.action('payment_details', async ctx => {
    await ctx.answerCbQuery()
    return ctx.scene.leave()
  })

  return scene
}
