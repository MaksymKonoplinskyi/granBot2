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

  @OneToMany(() => EventParticipant, participant => participant.event, { cascade: true })
  participants!: EventParticipant[];

  @Column('boolean', { default: false })
  isPublished!: boolean;

  @Column('boolean', { default: false })
  isCancelled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}