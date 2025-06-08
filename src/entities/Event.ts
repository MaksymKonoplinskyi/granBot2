import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column()
  startDate!: Date;
  
  @Column()
  endDate!: Date;

  @Column()
  location!: string;

  @Column()
  participants!: string[];
  
  @Column()
  isPublished!: boolean;
  
}