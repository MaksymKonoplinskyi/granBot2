import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Event } from './entities/Event';
import { EventParticipant } from './entities/EventParticipant';
import { User } from './entities/User';
import { PaymentDetails } from './entities/PaymentDetails';

export function getDataSource(verbose: boolean = false): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER,
    password: String(process.env.DB_PASS),
    database: process.env.DB_NAME,
    synchronize: true, // В проде лучше false!
    logging: verbose,
    entities: [Event, EventParticipant, User, PaymentDetails],
  });
}
