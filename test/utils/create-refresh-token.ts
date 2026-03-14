import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import { RefreshTokenEntity } from '../../src/entity/refresh-token.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { hashCreate } from './hash';

export async function createRefreshToken(
  dataSource: DataSource,
  user: UserEntity
): Promise<RefreshTokenEntity> {
  const repo = dataSource.getRepository(RefreshTokenEntity);
  const tokenHash = await hashCreate('fake-refresh-token');

  return repo.save(
    repo.create({
      user,
      tokenHash,
      expiredAt: DateTime.utc().plus({ hours: 1 }).toJSDate()
    })
  );
}
