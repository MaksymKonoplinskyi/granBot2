import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Event } from './entities/Event';
// ADMINS больше не нужен здесь, если он используется только в bot.ts

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
    entities: [Event],
  });
}

// Убираем AppDataSource.initialize() отсюда