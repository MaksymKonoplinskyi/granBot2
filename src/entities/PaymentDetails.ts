import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity()
export class PaymentDetails {
  @PrimaryGeneratedColumn()
  id!: number

  @Column('text')
  title!: string

  @Column('text')
  description!: string
}
