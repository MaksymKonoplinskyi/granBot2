import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Event } from './Event';
import { User } from './User';

export enum ParticipationStatus {
  PAYMENT_ON_SITE = 'payment_on_site',           // Оплата на месте
  PENDING_PAYMENT = 'pending_payment',           // Ожидает оплаты
  PAYMENT_CONFIRMATION = 'payment_confirmation', // Подтверждение оплаты
  PAYMENT_CONFIRMED = 'payment_confirmed',       // Оплата подтверждена
  CANCELLED_NO_PAYMENT = 'cancelled_no_payment', // Отмена без оплаты
  PENDING_REFUND = 'pending_refund'             // Ожидание возврата средств
}

@Entity()
export class EventParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, user => user.eventParticipations, { eager: true })
  user!: User;

  @ManyToOne(() => Event, event => event.participants, { eager: true })
  event!: Event;

  @Column({
    type: 'enum',
    enum: ParticipationStatus,
    default: ParticipationStatus.PENDING_PAYMENT
  })
  status!: ParticipationStatus;

  @Column({ default: false })
  isPaid!: boolean;

  @Column('varchar', { nullable: true })
  comment!: string | null;

  @Column('int', { default: 1 })
  guestsCount!: number;

  @Column('varchar', { nullable: true })
  dietaryRestrictions!: string | null;

  @CreateDateColumn()
  joinedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
} 