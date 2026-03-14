import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import { RegistrationEntity } from '../../src/entity/registration.entity';
import { hashCreate } from './hash';

export const FAKE_VERIFICATION_TOKEN = 'fake-verification-token';

export async function createRegistration(
  dataSource: DataSource,
  email: string,
  clearPassword: string,
  options?: { tokenExpiresAt?: Date }
): Promise<RegistrationEntity> {
  const repo = dataSource.getRepository(RegistrationEntity);
  const passwordHash = await hashCreate(clearPassword);
  const emailVerificationTokenHash = await hashCreate(
    FAKE_VERIFICATION_TOKEN
  );

  return repo.save(
    repo.create({
      email,
      passwordHash,
      emailVerificationTokenHash,
      emailVerificationTokenExpiresAt:
        options?.tokenExpiresAt ??
        DateTime.utc().plus({ hours: 1 }).toJSDate()
    })
  );
}
