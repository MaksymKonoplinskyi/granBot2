import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm'
import { EventParticipant } from './EventParticipant'

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number

  @Column('integer')
  telegramId!: number

  @Column({ type: 'text', nullable: true })
  firstName!: string | null

  @Column({ type: 'text', nullable: true })
  lastName!: string | null

  @Column({ type: 'text', nullable: true })
  username!: string | null

  @Column({ type: 'boolean', default: false })
  isAdmin!: boolean

  @OneToMany(() => EventParticipant, participant => participant.user)
  eventParticipations!: EventParticipant[]

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
