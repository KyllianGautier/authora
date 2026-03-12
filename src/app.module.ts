import { readFileSync } from 'fs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_QUEUE } from './config/constants';
import { envValidationSchema } from './config/env.validation';
import { CONTROLLERS } from './controller';
import { ENTITIES } from './entity';
import { SERVICES } from './service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow('HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.getOrThrow('DB_USERNAME'),
        password: config.getOrThrow('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        entities: ENTITIES,
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
  providers: [...SERVICES]
})
export class AppModule {}
