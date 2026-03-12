import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { PasswordEntity } from '../../src/entity/password.entity';
import { UserEntity } from '../../src/entity/user.entity';

export async function createUserWithPassword(
  dataSource: DataSource,
  email: string,
  clearPassword: string
): Promise<UserEntity> {
  const userRepo = dataSource.getRepository(UserEntity);
  const passwordRepo = dataSource.getRepository(PasswordEntity);

  const user = await userRepo.save(userRepo.create({ email }));
  const passwordHash = await bcrypt.hash(clearPassword, 4);
  await passwordRepo.save(passwordRepo.create({ user, passwordHash }));

  return user;
}
