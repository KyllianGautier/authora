import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../entity/index';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

export default new DataSource({
  type: 'postgres',
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT ?? 5432),
  username: process.env.PG_USERNAME,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE ?? 'authora_db',
  schema: 'authora',
  entities: ENTITIES,
  migrations: ['src/migration/*.ts']
});
