import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import { testTenantConfig } from '../../../src/config/tenant-config';
import { TrustedDeviceEntity } from '../../../src/entity/trusted-device.entity';
import { UserEntity } from '../../../src/entity/user.entity';
import { hashCreate } from './hash';

export const FAKE_DEVICE_FINGERPRINT = 'fake-device-fingerprint';

export async function createTrustedDevice(
  dataSource: DataSource,
  user: UserEntity,
  options?: { trusted?: boolean; trustedUntil?: Date }
): Promise<TrustedDeviceEntity> {
  const repo = dataSource.getRepository(TrustedDeviceEntity);
  const now = DateTime.utc().toJSDate();
  const fingerprintHash = await hashCreate(FAKE_DEVICE_FINGERPRINT);

  return repo.save(
    repo.create({
      user,
      fingerprintHash,
      name: 'Test Device',
      lastIp: '127.0.0.1',
      userAgent: 'test-agent',
      firstSeenAt: now,
      lastSeenAt: now,
      trusted: options?.trusted ?? false,
      trustedUntil: options?.trustedUntil ??
        DateTime.utc().plus({ seconds: testTenantConfig.trustedDeviceTtlSec }).toJSDate()
    })
  );
}
