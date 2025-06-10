import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class ClubInfo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('text')
  description!: string;
} 