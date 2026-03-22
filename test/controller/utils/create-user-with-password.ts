import { DataSource } from 'typeorm';
import { hashCreate } from './hash';
import { PasswordEntity } from '../../../src/entity/password.entity';
import { UserEntity } from '../../../src/entity/user.entity';
import { getDefaultTenant } from './get-default-tenant';

export async function createUserWithPassword(
  dataSource: DataSource,
  email: string,
  clearPassword: string
): Promise<UserEntity> {
  const userRepo = dataSource.getRepository(UserEntity);
  const passwordRepo = dataSource.getRepository(PasswordEntity);
  const tenant = await getDefaultTenant(dataSource);

  const user = await userRepo.save(userRepo.create({ email, tenant }));
  const passwordHash = await hashCreate(clearPassword);
  await passwordRepo.save(passwordRepo.create({ user, passwordHash }));

  return user;
}
