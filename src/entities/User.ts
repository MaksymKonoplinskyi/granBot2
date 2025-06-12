import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { EventParticipant } from './EventParticipant';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  telegramId!: number;

  @Column()
  firstName!: string;

  @Column({ nullable: true })
  lastName!: string;

  @Column({ nullable: true })
  username!: string;

  @Column({ default: false })
  isAdmin!: boolean;

  @OneToMany(() => EventParticipant, participant => participant.user)
  eventParticipations!: EventParticipant[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
} 