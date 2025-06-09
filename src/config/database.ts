import { DataSource } from 'typeorm';
import { Event } from '../entities/Event';
import { EventParticipant } from '../entities/EventParticipant';
import { User } from '../entities/User';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite',
  synchronize: true,
  logging: false,
  entities: [Event, EventParticipant, User],
  migrations: [],
  subscribers: [],
}); 