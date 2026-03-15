import { mkdirSync, writeFileSync } from 'fs';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { version } from '../package.json';

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false
  });

  app.setGlobalPrefix('api', { exclude: [] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const config = new DocumentBuilder()
    .setTitle('Authora')
    .setDescription('Authora API documentation')
    .setVersion(version)
    .build();

  const document = SwaggerModule.createDocument(app, config);

  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/openapi.json', JSON.stringify(document, null, 2));

  await app.close();
  process.exit(0);
}

main();
