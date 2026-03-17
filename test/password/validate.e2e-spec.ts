import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { getTestApp, resetTestState } from '../setup';

// Validates a password against the configured strength rules.
// Always returns 200 with { valid, errors }.
// In the test environment only PASSWORD_MIN_LENGTH is enforced (all other rules are disabled).
describe('POST /password/check-strength', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await getTestApp();
  }, 120_000);

  beforeEach(async () => {
    await resetTestState();
  });

  describe('validation', () => {
    it('should return 400 when password is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({})
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['password must be a string'])
      );
    });

    it('should return 400 when password is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: '' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['password should not be empty'])
      );
    });
  });

  describe('behavior', () => {
    it('should return 200 with valid true when password meets all rules', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'V@lidP4ss!' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return 200 with valid false when password is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'Ab1!' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual([
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 200 with valid true when password lacks a digit (rule disabled)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'NoDigitHere!' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return 200 with valid true when password lacks a special character (rule disabled)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'NoSpecial1a' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return 200 with valid true when password lacks an uppercase letter (rule disabled)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'nouppercase1!' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return 200 with valid true when password lacks a lowercase letter (rule disabled)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'NOLOWERCASE1!' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return 200 with valid false when password fails min length', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'short' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual([
        'Password must contain at least 8 characters'
      ]);
    });

    it('should return 200 with valid true when password contains user email info (rule disabled)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'Xjohn5X!', email: 'john@example.com' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should not check user info rule when email is not provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'Xjohn5X!' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });
  });
});
