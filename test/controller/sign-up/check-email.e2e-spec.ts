import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import { createRegistration } from '../utils/create-registration';
import { createUser } from '../utils/create-user';

// Checks if an email is available for registration.
// Returns a vague message in both cases to avoid leaking whether an email is registered.
describe('POST /sign-up/check-email', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await getTestApp();
    dataSource = app.get(DataSource);
  }, 20_000);

  beforeEach(async () => {
    await resetTestState();
    await consumeEmailQueue();
  });

  describe('validation', () => {
    it('should return 400 when email is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toEqual(['email must be an email']);
    });
  });

  describe('behavior', () => {
    it('should return 200 when email is available', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'available@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'You can continue the registration process if this email is valid.'
      );
    });

    it('should return 200 when email is already used by a registration', async () => {
      await createRegistration(
        dataSource,
        'taken@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'taken@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the email can be used, you will be able to sign-up.'
      );
    });

    it('should return 200 when email is already used by a user', async () => {
      await createUser(dataSource, 'existing@example.com');

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'existing@example.com' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the email can be used, you will be able to sign-up.'
      );
    });

    it('should normalize email to lowercase', async () => {
      await createUser(dataSource, 'user@example.com');

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'User@Example.COM' })
        .expect(200);

      expect(response.body.message).toBe(
        'If the email can be used, you will be able to sign-up.'
      );
    });
  });

  // Three-dimensional rate limiting: combined (same IP+email, limit 5),
  // identity (same email from different IPs, limit 10), origin (same IP with different emails, limit 30).
  describe('throttling', () => {
    it('should return 429 when combined rate limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/check-email')
          .send({ email: 'combined@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'combined@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when identity rate limit is exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/check-email')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({ email: 'identity@example.com' });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ email: 'identity@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });

    it('should return 429 when origin rate limit is exceeded', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/sign-up/check-email')
          .send({ email: `origin-${i}@example.com` });
      }

      const response = await request(app.getHttpServer())
        .post('/api/v1/sign-up/check-email')
        .send({ email: 'origin-final@example.com' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
    });
  });
});
