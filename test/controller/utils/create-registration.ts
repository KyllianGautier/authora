import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../../src/entity/registration.entity';
import { hashCreate } from './hash';
import { getDefaultTenant } from './get-default-tenant';

export const FAKE_VERIFICATION_TOKEN = 'fake-verification-token';

export async function createRegistration(
  dataSource: DataSource,
  email: string,
  clearPassword: string,
  options?: { tokenExpiresAt?: Date }
): Promise<RegistrationEntity> {
  const repo = dataSource.getRepository(RegistrationEntity);
  const tenant = await getDefaultTenant(dataSource);
  const passwordHash = await hashCreate(clearPassword);
  const emailVerificationTokenHash = await hashCreate(
    FAKE_VERIFICATION_TOKEN
  );

  return repo.save(
    repo.create({
      email,
      tenant,
      passwordHash,
      emailVerificationTokenHash,
      emailVerificationTokenExpiresAt:
        options?.tokenExpiresAt ??
        DateTime.utc().plus({ hours: 1 }).toJSDate()
    })
  );
}
