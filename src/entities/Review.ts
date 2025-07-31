import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { User } from './User'
import { Event } from './Event'

export enum ReviewType {
  CLUB = 'club',
  EVENT = 'event',
}

export enum ReviewStatus {
  PUBLIC = 'public',
  PRIVATE = 'private', // Только для организаторов
  HIDDEN = 'hidden', // Скрытый админом
}

@Entity()
export class Review {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User, { eager: true })
  author!: User

  @Column()
  type!: ReviewType

  @ManyToOne(() => Event, { nullable: true, eager: true })
  event?: Event

  @Column('text')
  content!: string

  @Column({ default: 'public' })
  status!: ReviewStatus

  @Column({ default: false })
  isAnonymous!: boolean

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
