import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../src/entity/user.entity';
import { resetTestState, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /sign-up/check-email', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 120_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });
  });

  describe('behavior', () => {
    it('should return 200 when email is available', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({ email: 'available@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'You can continue the registration process if this email is valid.'
      );
    });

    it('should return 200 when email is already used by a registration', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'taken@example.com', password: 'password123' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({ email: 'taken@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the email can be used, you will be able to sign-up.'
      );
    });

    it('should return 200 when email is already used by a user', async () => {
      const userRepo = dataSource.getRepository(UserEntity);
      await userRepo.save(userRepo.create({ email: 'existing@example.com' }));

      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({ email: 'existing@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the email can be used, you will be able to sign-up.'
      );
    });

    it('should normalize email to lowercase', async () => {
      const userRepo = dataSource.getRepository(UserEntity);
      await userRepo.save(userRepo.create({ email: 'user@example.com' }));

      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({ email: 'User@Example.COM' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the email can be used, you will be able to sign-up.'
      );
    });
  });

  describe('throttling', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/sign-up/check-email')
          .send({ email: 'throttle@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/sign-up/check-email')
        .send({ email: 'throttle@example.com' });

      expect(response.status).toBe(429);
    });
  });
});
