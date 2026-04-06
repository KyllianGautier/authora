import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { DateTime } from 'luxon';
import { TrustedDeviceEntity } from '../../../src/entity/trusted-device.entity';
import { consumeEmailQueue, getTestApp, resetTestState } from '../../setup';
import { createUserWithPassword } from '../utils/create-user-with-password';
import { createTrustedDevice } from '../utils/create-trusted-device';
import { signTestJwt } from '../utils/sign-jwt';

const BASE = '/api/v1/account';

// GET /account/device — lists all devices for the authenticated user.
describe('GET /account/device', () => {
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
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/device`)
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });

    it('should return 401 when token is invalid', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/device`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toBe('Invalid or expired access token');
    });
  });

  describe('behavior', () => {
    it('should return 200 with an empty list when user has no devices', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/device`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return 200 with the list of devices', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      await createTrustedDevice(dataSource, user);
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/device`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Test Device');
      expect(response.body[0].browser).toBeDefined();
      expect(response.body[0].os).toBeDefined();
      expect(response.body[0].deviceType).toBeDefined();
      expect(response.body[0].lastIp).toBeDefined();
    });

    it('should not return devices from another user', async () => {
      const user1 = await createUserWithPassword(dataSource, 'user1@example.com', 'password123');
      const user2 = await createUserWithPassword(dataSource, 'user2@example.com', 'password123');
      await createTrustedDevice(dataSource, user1);
      const token = signTestJwt({ sub: user2.id, email: user2.email });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/device`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});

// POST /account/device/:id/distrust — removes trust from a device.
describe('POST /account/device/:id/distrust', () => {
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
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/device/00000000-0000-0000-0000-000000000000/distrust`)
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });
  });

  describe('behavior', () => {
    it('should return 200 and set trusted to false', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const device = await createTrustedDevice(dataSource, user, {
        trusted: true,
        trustedUntil: DateTime.utc().plus({ hours: 1 }).toJSDate()
      });
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .post(`${BASE}/device/${device.id}/distrust`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.id).toBe(device.id);
      expect(response.body.trusted).toBe(false);

      const updated = await dataSource.getRepository(TrustedDeviceEntity).findOneBy({ id: device.id });
      expect(updated!.trusted).toBe(false);
      expect(updated!.trustedUntil).toBeNull();
    });

    it('should return 404 when device does not exist', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .post(`${BASE}/device/00000000-0000-0000-0000-000000000000/distrust`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.message).toBe('Device not found');
    });

    it('should return 404 when device belongs to another user', async () => {
      const user1 = await createUserWithPassword(dataSource, 'user1@example.com', 'password123');
      const user2 = await createUserWithPassword(dataSource, 'user2@example.com', 'password123');
      const device = await createTrustedDevice(dataSource, user1, { trusted: true });
      const token = signTestJwt({ sub: user2.id, email: user2.email });

      const response = await request(app.getHttpServer())
        .post(`${BASE}/device/${device.id}/distrust`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.message).toBe('Device not found');
    });
  });
});

// DELETE /account/device/:id — deletes a device.
describe('DELETE /account/device/:id', () => {
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
    it('should return 401 when no token is provided', async () => {
      const response = await request(app.getHttpServer())
        .delete(`${BASE}/device/00000000-0000-0000-0000-000000000000`)
        .expect(401);

      expect(response.body.message).toBe('Missing or invalid authorization header');
    });
  });

  describe('behavior', () => {
    it('should return 200 and delete the device', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const device = await createTrustedDevice(dataSource, user);
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .delete(`${BASE}/device/${device.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.message).toBe('Device deleted');

      const deleted = await dataSource.getRepository(TrustedDeviceEntity).findOneBy({ id: device.id });
      expect(deleted).toBeNull();
    });

    it('should return 404 when device does not exist', async () => {
      const user = await createUserWithPassword(dataSource, 'user@example.com', 'password123');
      const token = signTestJwt({ sub: user.id, email: user.email });

      const response = await request(app.getHttpServer())
        .delete(`${BASE}/device/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.message).toBe('Device not found');
    });

    it('should return 404 when device belongs to another user', async () => {
      const user1 = await createUserWithPassword(dataSource, 'user1@example.com', 'password123');
      const user2 = await createUserWithPassword(dataSource, 'user2@example.com', 'password123');
      const device = await createTrustedDevice(dataSource, user1);
      const token = signTestJwt({ sub: user2.id, email: user2.email });

      const response = await request(app.getHttpServer())
        .delete(`${BASE}/device/${device.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.message).toBe('Device not found');
    });
  });
});
