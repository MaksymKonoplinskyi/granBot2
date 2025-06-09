import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ nullable: true })
  description!: string;

  @Column({ nullable: true })
  startDate!: Date;
  
  @Column({ nullable: true })
  endDate!: Date;

  @Column({ nullable: true })
  location!: string;

  @Column('simple-array', { nullable: true })
  participants!: string[];
  
  @Column('boolean', { default: false })
  isPublished!: boolean;
}