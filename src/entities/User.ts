import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { EventParticipant } from './EventParticipant';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  telegramId!: number;

  @Column('varchar', { nullable: true })
  username!: string | null;

  @Column('varchar', { nullable: true })
  firstName!: string | null;

  @Column('varchar', { nullable: true })
  lastName!: string | null;

  @Column('varchar', { nullable: true })
  phoneNumber!: string | null;

  @Column('varchar', { nullable: true })
  email!: string | null;

  @OneToMany(() => EventParticipant, participant => participant.user)
  eventParticipations!: EventParticipant[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
} 