import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { EventParticipant } from './EventParticipant';

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  @Column()
  startDate!: Date;

  @Column()
  endDate!: Date;

  @Column({ default: false })
  isPublished!: boolean;

  @Column({ default: false })
  isCancelled!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  fullPaymentAmount!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  advancePaymentAmount!: number | null;

  @Column({ type: 'timestamp', nullable: true })
  advancePaymentDeadline!: Date | null;

  @Column({ default: true })
  allowOnSitePayment!: boolean;

  @Column({ type: 'varchar', nullable: true })
  location!: string | null;

  @OneToMany(() => EventParticipant, participant => participant.event)
  participants!: EventParticipant[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}