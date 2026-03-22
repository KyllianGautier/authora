import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../../src/entity/registration.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import { createRegistration } from '../utils/create-registration';
import { hashVerify } from '../utils/hash';

// Generates a new verification token for an existing registration and re-sends the verification email.
describe('POST /sign-up/resend-verification-email', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 60_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });
  });

  describe('behavior', () => {
    it('should return 404 when no registration exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({ email: 'unknown@example.com' })
        .expect(404);

      expect(response.body.message).toBe(
        "No pending sign-up found for email 'unknown@example.com'"
      );
    });

    it('should return 200, update the verification token and send email to queue', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123'
      );

      // Snapshot the token hash before resend to verify it gets rotated
      const registrationBefore = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'user@example.com' });

      await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({ email: 'user@example.com' })
        .expect(200);

      // The token hash in DB must have changed (new token generated)
      const registrationAfter = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'user@example.com' });

      expect(registrationAfter!.emailVerificationTokenHash).not.toBe(
        registrationBefore!.emailVerificationTokenHash
      );

      // Verify the clear token in the queue message matches the new hashed token in DB
      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].pattern).toBe('sign-up-verification');
      expect(messages[0].data.email).toBe('user@example.com');
      await expect(
        hashVerify(
          registrationAfter!.emailVerificationTokenHash,
          messages[0].data.token as string
        )
      ).resolves.toBe(true);
    });

    it('should normalize email to lowercase', async () => {
      await createRegistration(
        dataSource,
        'user@example.com',
        'password123'
      );

      await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({ email: 'User@Example.COM' })
        .expect(200);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0].data.email).toBe('user@example.com');
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/resend-verification-email')
          .send({ email: 'combined@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({ email: 'combined@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/resend-verification-email')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/resend-verification-email')
          .send({ email: `origin-${i}@example.com` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/resend-verification-email')
        .send({ email: 'origin-final@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
