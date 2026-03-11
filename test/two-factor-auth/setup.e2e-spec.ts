import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TwoFactorAuthEntity } from '../../src/entity/two-factor-auth.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { clearDatabase, consumeEmailQueue, getTestApp } from '../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';

describe('POST /2fa/setup', () => {
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
        .post('/2fa/setup')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('should return 400 when password is empty', () => {
      return request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: '' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/2fa/setup')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'unknown@example.com', password: 'password123' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when password is wrong', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'correctPassword'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'wrongPassword' })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 with a qrcode and manual code', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.qrcode).toMatch(/^data:image\/png;base64,/);
      expect(response.body.manualCode).toBeDefined();
      expect(typeof response.body.manualCode).toBe('string');
      expect(response.body.manualCode.length).toBeGreaterThan(0);
    });

    it('should create a two-factor auth record in the database', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const twoFactorAuth = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .findOne({ where: { user: { email: 'user@example.com' } } });

      expect(twoFactorAuth).not.toBeNull();
      expect(twoFactorAuth!.isEnabled).toBe(false);
      expect(twoFactorAuth!.secret).toBe(response.body.manualCode);
      expect(twoFactorAuth!.recoveryCodeHashes).toEqual([]);
    });

    it('should replace previous two-factor auth on re-setup', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const firstResponse = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      const secondResponse = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(200);

      // A new secret should be generated
      expect(secondResponse.body.manualCode).not.toBe(
        firstResponse.body.manualCode
      );

      const allTwoFactorAuths = await dataSource
        .getRepository(TwoFactorAuthEntity)
        .find({ where: { user: { email: 'user@example.com' } } });

      expect(allTwoFactorAuths).toHaveLength(1);
    });

    it('should return 409 when two-factor auth is already enabled', async () => {
      const user = await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const twoFactorAuthRepo = dataSource.getRepository(TwoFactorAuthEntity);
      await twoFactorAuthRepo.save(
        twoFactorAuthRepo.create({
          user,
          secret: 'some-secret',
          isEnabled: true,
          recoveryCodeHashes: ['hash1']
        })
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'user@example.com', password: 'password123' })
        .expect(409);

      expect(response.body.message).toBe(
        'Two-factor authentication is already enabled'
      );
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(
        dataSource,
        'user@example.com',
        'password123'
      );

      const response = await request(app.getHttpServer())
        .post('/2fa/setup')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(200);

      expect(response.body.qrcode).toMatch(/^data:image\/png;base64,/);
      expect(response.body.manualCode).toBeDefined();
    });
  });
});
