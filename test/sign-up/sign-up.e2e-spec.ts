import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../src/entity/registration.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { clearDatabase, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /sign-up', () => {
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
        .post('/sign-up')
        .send({ password: 'password123' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'user@example.com' })
        .expect(400);
    });

    it('should return 400 when password is empty', () => {
      return request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'user@example.com', password: '' })
        .expect(400);
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer()).post('/sign-up').send({}).expect(400);
    });
  });

  describe('behavior', () => {
    it('should create a registration and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'new@example.com', password: 'password123' })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          email: 'new@example.com',
          createdAt: expect.any(String)
        })
      );
    });

    it('should store a registration in the database', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'stored@example.com', password: 'password123' })
        .expect(201);

      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'stored@example.com' });

      expect(registration).not.toBeNull();
      expect(registration!.passwordHash).not.toBe('password123');
      expect(registration!.emailVerificationTokenHash).toBeDefined();
      expect(registration!.emailVerificationTokenExpiresAt).toBeDefined();
    });

    it('should normalize email to lowercase', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'Upper@Example.COM', password: 'password123' })
        .expect(201);

      const registration = await dataSource
        .getRepository(RegistrationEntity)
        .findOneBy({ email: 'upper@example.com' });

      expect(registration).not.toBeNull();
    });

    it('should return 409 when email is already used in registration', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'duplicate@example.com', password: 'password123' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'duplicate@example.com', password: 'password456' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'duplicate@example.com' is already used"
      );
    });

    it('should return 409 when email is already used by a user', async () => {
      const userRepo = dataSource.getRepository(UserEntity);
      await userRepo.save(userRepo.create({ email: 'existing@example.com' }));

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'existing@example.com', password: 'password123' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'existing@example.com' is already used"
      );
    });

    it('should return 409 when email differs only by case in registration', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'user@example.com', password: 'password456' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'user@example.com' is already used"
      );
    });

    it('should return 409 when email differs only by case in user', async () => {
      const userRepo = dataSource.getRepository(UserEntity);
      await userRepo.save(userRepo.create({ email: 'user@example.com' }));

      const response = await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'User@Example.COM', password: 'password123' })
        .expect(409);

      expect(response.body.message).toBe(
        "Email 'user@example.com' is already used"
      );
    });

    it('should send a verification email to the queue', async () => {
      await request(app.getHttpServer())
        .post('/sign-up')
        .send({ email: 'verify@example.com', password: 'password123' })
        .expect(201);

      const messages = await consumeEmailQueue();

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        pattern: 'sign-up-verification',
        data: {
          email: 'verify@example.com',
          token: expect.any(String)
        }
      });
    });
  });
});
