import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { EventParticipant } from './EventParticipant';

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  title!: string;

  @Column('text', { nullable: true })
  description!: string | null;

  @Column('varchar', { nullable: true })
  location!: string | null;

  @Column('timestamp')
  startDate!: Date;

  @Column('timestamp', { nullable: true })
  endDate!: Date | null;

  @Column('boolean', { default: false })
  isPublished!: boolean;

  @Column('boolean', { default: false })
  isCancelled!: boolean;

  @Column('boolean', { default: false })
  allowOnSitePayment!: boolean;

  @Column('decimal', { nullable: true, precision: 10, scale: 2 })
  partialPaymentAmount!: number | null;

  @Column('decimal', { nullable: true })
  advancePaymentAmount!: number | null;

  @Column('timestamp', { nullable: true })
  advancePaymentDeadline!: Date | null;

  @Column('decimal', { nullable: true, precision: 10, scale: 2 })
  fullPaymentAmount!: number | null;

  @OneToMany(() => EventParticipant, participant => participant.event, { cascade: true })
  participants!: EventParticipant[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}