import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { Event } from './Event'
import { User } from './User'

export enum ParticipationStatus {
  PAYMENT_NOT_CHOSEN = 'payment_not_chosen', // Временный статус после регистрации, до выбора способа оплаты
  PAYMENT_ON_SITE = 'payment_on_site', // Пользователь выбрал оплату на месте
  PENDING_PAYMENT = 'pending_payment', // Ожидает оплаты от пользователя (пользователь еще не оплатил)
  PAYMENT_CONFIRMATION = 'payment_confirmation', // Подтверждение оплаты (Пользователь нажал на кнопку что он оплатил и мы ожидаем подтверждения админа)
  PAYMENT_CONFIRMED = 'payment_confirmed', // Оплата подтверждена (Админ подтвердил оплату)
  CANCELLED_NO_PAYMENT = 'cancelled_no_payment', // Отмена без оплаты
  PENDING_REFUND = 'pending_refund', // Ожидание возврата средств (Пользователь отменил участие во встрече после оплаты)
}

@Entity()
export class EventParticipant {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User, user => user.eventParticipations, { eager: true })
  user!: User

  @ManyToOne(() => Event, event => event.participants, { eager: true })
  event!: Event

  @Column({
    type: 'text',
    default: ParticipationStatus.PAYMENT_NOT_CHOSEN,
  })
  status!: ParticipationStatus

  @Column({ type: 'boolean', default: false })
  isPaid!: boolean

  @Column({ type: 'text', nullable: true })
  comment!: string | null

  @Column({ type: 'integer', default: 1 })
  guestsCount!: number

  @Column({ type: 'text', nullable: true })
  dietaryRestrictions!: string | null

  @CreateDateColumn()
  joinedAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
