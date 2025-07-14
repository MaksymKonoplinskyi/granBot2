import { Scenes } from 'telegraf'

export interface BotConfig {
  token: string
  verbose: boolean
  webhookUrl?: string
  port?: number
}

export interface PaymentDetailsSceneState {
  title: string
  detailsId?: number
  editing?: boolean
}

export interface EventSceneState {
  event: any
  eventId?: number
  editingField?: string
  deleting?: boolean
}

export interface WizardSessionData extends Scenes.WizardSessionData {
  state: PaymentDetailsSceneState | EventSceneState
}

export type BotContext = Scenes.WizardContext<WizardSessionData> & {
  match?: RegExpMatchArray
}

export interface CommandHandler {
  name: string
  execute(ctx: BotContext): Promise<void>
}

export interface ActionHandler {
  pattern: string | RegExp
  execute(ctx: BotContext): Promise<void>
}

export interface Scene {
  name: string
  create(): Scenes.WizardScene<BotContext> | Scenes.BaseScene<BotContext>
}
