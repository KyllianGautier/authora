import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { AppModule } from './app.module';
import { version } from '../package.json';

async function ensureSchema() {
  const client = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT ?? 5432),
    user: process.env.PG_USERNAME,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE ?? 'authora_db'
  });

  await client.connect();
  await client.query('CREATE SCHEMA IF NOT EXISTS authora');
  await client.end();
}

async function bootstrap() {
  await ensureSchema();

  const app = await NestFactory.create(AppModule);

  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('Authora')
    .setDescription('Authora API documentation')
    .setVersion(version)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
