import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../src/entity/one-time-token.entity';
import { UserEntity } from '../../src/entity/user.entity';
import { hashCreate } from './hash';

export async function createOneTimeToken(
  dataSource: DataSource,
  user: UserEntity,
  type: OneTimeTokenType
): Promise<OneTimeTokenEntity> {
  const repo = dataSource.getRepository(OneTimeTokenEntity);
  const tokenHash = await hashCreate('fake-one-time-token');

  return repo.save(
    repo.create({
      user,
      type,
      tokenHash,
      expiredAt: DateTime.utc().plus({ hours: 1 }).toJSDate()
    })
  );
}
