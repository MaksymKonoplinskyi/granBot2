import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Event } from './entities/Event';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  synchronize: true, // В проде лучше false!
  logging: false,
  entities: [Event],
});

const ADMINS = (process.env.ADMINS || '397062368').split(',').map(id => id.trim());
function isAdmin(userId: number | string) {
  return ADMINS.includes(String(userId));
}