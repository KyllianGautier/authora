import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { getTestApp, resetTestState } from '../setup';

// Validates a password against the configured strength rules.
// Always returns 200 with { valid, errors }.
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
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('at least')
        ])
      );
    });

    it('should return 200 with valid false when password lacks a digit', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'NoDigitHere!' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('digit')
        ])
      );
    });

    it('should return 200 with valid false when password lacks a special character', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'NoSpecial1a' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('special character')
        ])
      );
    });

    it('should return 200 with valid false when password lacks an uppercase letter', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'nouppercase1!' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('uppercase')
        ])
      );
    });

    it('should return 200 with valid false when password lacks a lowercase letter', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'NOLOWERCASE1!' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('lowercase')
        ])
      );
    });

    it('should return 200 with multiple errors when password fails multiple rules', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'short' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors.length).toBeGreaterThan(1);
    });

    it('should return 200 with valid false when password contains user email info', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/password/check-strength')
        .send({ password: 'Xjohn5X!', email: 'john@example.com' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('email')
        ])
      );
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
