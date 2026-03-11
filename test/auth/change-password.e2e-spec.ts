import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { PasswordEntity } from '../../src/entity/password.entity';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { clearDatabase, consumeEmailQueue, getTestApp } from '../setup';

describe('POST /auth/change-password', () => {
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
        .post('/auth/change-password')
        .send({ currentPassword: 'old123', newPassword: 'new123' })
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'not-an-email',
          currentPassword: 'old123',
          newPassword: 'new123'
        })
        .expect(400);
    });

    it('should return 400 when currentPassword is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ email: 'user@example.com', newPassword: 'new123' })
        .expect(400);
    });

    it('should return 400 when currentPassword is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: '',
          newPassword: 'new123'
        })
        .expect(400);
    });

    it('should return 400 when newPassword is missing', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ email: 'user@example.com', currentPassword: 'old123' })
        .expect(400);
    });

    it('should return 400 when newPassword is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'old123',
          newPassword: ''
        })
        .expect(400);
    });

    it('should return 400 when newPassword is the same as currentPassword', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'samePassword',
          newPassword: 'samePassword'
        })
        .expect(400);

      expect(response.body.message).toContain(
        'New password must be different from current password'
      );
    });

    it('should return 400 when body is empty', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({})
        .expect(400);
    });
  });

  describe('behavior', () => {
    it('should return 401 when user does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'unknown@example.com',
          currentPassword: 'old123',
          newPassword: 'new123'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 when current password is wrong', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'correctPassword');

      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'wrongPassword',
          newPassword: 'new123'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 200 and change the password', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      const passwords = await dataSource.getRepository(PasswordEntity).find({
        where: { user: { email: 'user@example.com' } },
        order: { createdAt: 'ASC' }
      });

      expect(passwords).toHaveLength(2);
      expect(passwords[0].revoked).toBe(true);
      expect(passwords[1].revoked).toBe(false);

      const newPasswordMatches = await bcrypt.compare(
        'newPassword',
        passwords[1].passwordHash
      );
      expect(newPasswordMatches).toBe(true);
    });

    it('should allow login with new password after change', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      // Changing again with the new password should work
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'newPassword',
          newPassword: 'anotherPassword'
        })
        .expect(200);
    });

    it('should reject old password after change', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'oldPassword',
          newPassword: 'anotherPassword'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 400 when new password was already used', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password1');

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'password1',
          newPassword: 'password2'
        })
        .expect(200);

      // Try to reuse the first password
      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'password2',
          newPassword: 'password1'
        })
        .expect(400);

      expect(response.body.message).toBe('New password has already been used');
    });

    it('should reject reuse of any historical password', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'password1');

      // Change to password2
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'password1',
          newPassword: 'password2'
        })
        .expect(200);

      // Change to password3
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'password2',
          newPassword: 'password3'
        })
        .expect(200);

      // Try to reuse the very first password
      const response1 = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'password3',
          newPassword: 'password1'
        })
        .expect(400);

      expect(response1.body.message).toBe('New password has already been used');

      // Try to reuse the second password
      const response2 = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'user@example.com',
          currentPassword: 'password3',
          newPassword: 'password2'
        })
        .expect(400);

      expect(response2.body.message).toBe('New password has already been used');
    });

    it('should normalize email to lowercase', async () => {
      await createUserWithPassword(dataSource, 'user@example.com', 'oldPassword');

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          email: 'User@Example.COM',
          currentPassword: 'oldPassword',
          newPassword: 'newPassword'
        })
        .expect(200);
    });
  });
});
