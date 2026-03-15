import { readFileSync } from 'fs';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_QUEUE } from './config/constants';
import { envValidationSchema } from './config/env.validation';
import { CONTROLLERS } from './controller';
import { ENTITIES } from './entity';
import { DelayInterceptor } from './interceptor/delay.interceptor';
import { IsStrongPasswordConstraint } from './dto/validator/is-strong-password.decorator';
import { SERVICES } from './service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validationSchema: envValidationSchema
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow('PG_HOST'),
        port: config.get<number>('PG_PORT'),
        username: config.getOrThrow('PG_USERNAME'),
        password: config.getOrThrow('PG_PASSWORD'),
        database: config.get('PG_DATABASE'),
        schema: 'authora',
        entities: ENTITIES,
        migrations: ['dist/src/migration/*.js'],
        migrationsRun: true,
        synchronize: config.get('NODE_ENV') !== 'production'
      })
    }),
    TypeOrmModule.forFeature(ENTITIES),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        privateKey: readFileSync(
          config.getOrThrow<string>('JWT_PRIVATE_KEY_PATH'),
          'utf8'
        ),
        publicKey: readFileSync(
          config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH'),
          'utf8'
        ),
        signOptions: {
          algorithm: 'RS256',
          expiresIn: config.getOrThrow<number>(
            'JWT_ACCESS_TOKEN_EXPIRATION_SECONDS'
          )
        },
        verifyOptions: {
          algorithms: ['RS256']
        }
      })
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = config.getOrThrow<number>('THROTTLE_TTL_SECONDS') * 1000;
        const originLimit = config.getOrThrow<number>('THROTTLE_ORIGIN_LIMIT');
        const identityLimit = config.getOrThrow<number>('THROTTLE_IDENTITY_LIMIT');
        const combinedLimit = config.getOrThrow<number>('THROTTLE_COMBINED_LIMIT');
        const redisUrl = config.getOrThrow<string>('REDIS_URL')

        return {
          throttlers: [
            { name: 'origin', ttl, limit: originLimit },
            { name: 'identity', ttl, limit: identityLimit },
            { name: 'combined', ttl, limit: combinedLimit }
          ],
          storage: new ThrottlerStorageRedisService(redisUrl)
        };
      }
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'node_modules', '@kylliangautier', 'authora-admin'),
      serveRoot: '/admin'
    }),
    ClientsModule.registerAsync([
      {
        name: EMAIL_QUEUE,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'authora_email_queue',
            queueOptions: {
              durable: true
            }
          }
        })
      }
    ])
  ],
  controllers: [...CONTROLLERS],
  providers: [
    ...SERVICES,
    IsStrongPasswordConstraint,
    {
      provide: APP_INTERCEPTOR,
      useClass: DelayInterceptor
    }
  ]
})
export class AppModule {}
