import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../src/entity/registration.entity';
import { clearDatabase, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /sign-up/resend-verification-email', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 120_000);

  beforeEach(async () => {
    await clearDatabase();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({})
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 404 when no registration exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({ email: 'unknown@example.com' })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending sign-up found for email 'unknown@example.com'"
      );
    });

    it('should return 200 and update the verification token', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'resend@example.com', password: 'password123' })
        .expect(201);

      const registrationBefore = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'resend@example.com' });

      await request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({ email: 'resend@example.com' })
        .expect(200);

      const registrationAfter = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'resend@example.com' });

      expect(registrationAfter!.emailVerificationTokenHash).not.toBe(
        registrationBefore!.emailVerificationTokenHash
      );
    });

    it('should send a new verification email to the queue', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'resend2@example.com', password: 'password123' })
        .expect(201);

      // Drain the sign-up message
      await consumeEmailQueue();

      await request(app.getHttpServer())
        .post('/sign-up/resend-verification-email')
        .send({ email: 'resend2@example.com' })
        .expect(200);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        pattern: 'sign-up-verification',
        data: {
          email: 'resend2@example.com',
          token: expect.any(String)
        }
      });
    });
  });
});
