import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { getTestApp } from '../../setup';

// Returns the password strength rules configured on the server.
describe('GET /password/rules', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await getTestApp();
  }, 120_000);

  describe('behavior', () => {
    it('should return 200 with all password rules', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/password/rules')
        .expect(200);

      expect(response.body).toEqual({
        minLength: expect.any(Number),
        requireDigit: expect.any(Boolean),
        requireSpecialChar: expect.any(Boolean),
        requireLowercase: expect.any(Boolean),
        requireUppercase: expect.any(Boolean),
        forbidSequentialChars: expect.any(Boolean),
        forbidRepeatedChars: expect.any(Boolean),
        forbidKeyboardSequence: expect.any(Boolean),
        forbidUserInfo: expect.any(Boolean),
        forbidCommonPassword: expect.any(Boolean)
      });
    });

    it('should return minLength greater than or equal to 8', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/password/rules')
        .expect(200);

      expect(response.body.minLength).toBeGreaterThanOrEqual(8);
    });

    it('should return consistent rules across multiple requests', async () => {
      const first = await request(app.getHttpServer())
        .get('/api/v1/password/rules')
        .expect(200);

      const second = await request(app.getHttpServer())
        .get('/api/v1/password/rules')
        .expect(200);

      expect(first.body).toEqual(second.body);
    });
  });
});
