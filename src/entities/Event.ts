import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm'
import { EventParticipant } from './EventParticipant'

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: number

  @Column('text')
  title!: string

  @Column({ type: 'text', nullable: true })
  description!: string | null

  @Column('datetime')
  startDate!: Date

  @Column('datetime')
  endDate!: Date

  @Column({ type: 'boolean', default: false })
  isPublished!: boolean

  @Column({ type: 'boolean', default: false })
  isCancelled!: boolean

  @Column({ type: 'real', nullable: true })
  fullPaymentAmount!: number | null

  @Column({ type: 'real', nullable: true })
  advancePaymentAmount!: number | null

  @Column({ type: 'datetime', nullable: true })
  advancePaymentDeadline!: Date | null

  @Column({ type: 'boolean', default: true })
  allowOnSitePayment!: boolean

  @Column({ type: 'text', nullable: true })
  location!: string | null

  @Column({ type: 'text', nullable: true })
  imageFileId!: string | null

  @Column({ type: 'text', nullable: true })
  imageFileName!: string | null

  @Column({ type: 'datetime', nullable: true })
  scheduledPublishDate!: Date | null

  @OneToMany(() => EventParticipant, participant => participant.event)
  participants!: EventParticipant[]

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
