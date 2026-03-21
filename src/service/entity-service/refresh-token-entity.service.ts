import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { TOKEN_REUSE_KEY } from '../../config/redis-keys';
import { TENANT_CONFIG } from '../../config/tenant-config';
import type { AuthoraTenantConfig } from '../../config/tenant-config';
import { REDIS_CLIENT } from '../../config/redis.provider';
import { RefreshTokenEntity } from '../../entity/refresh-token.entity';
import { LockReason, UserEntity } from '../../entity/user.entity';
import { HashService } from '../hash.service';
import { UserEntityService } from './user-entity.service';

@Injectable()
export class RefreshTokenEntityService {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly _repository: Repository<RefreshTokenEntity>,
    private readonly _hashService: HashService,
    private readonly _userEntityService: UserEntityService,
    @Inject(REDIS_CLIENT) private readonly _redis: Redis,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  async create(user: UserEntity, expirationSeconds: number): Promise<string> {
    // Revoke previous refresh tokens for this user
    await this._repository.update(
      { user: { id: user.id }, revoked: false },
      { revoked: true }
    );

    const clearToken = randomBytes(32).toString('hex');
    const tokenHash = await this._hashService.hash(clearToken);

    const expiredAt = DateTime.utc()
      .plus({ seconds: expirationSeconds })
      .toJSDate();

    await this._repository.save(
      this._repository.create({
        user,
        tokenHash,
        family: randomUUID(),
        expiredAt
      })
    );

    return clearToken;
  }

  async findActiveForUser(
    user: UserEntity
  ): Promise<RefreshTokenEntity | null> {
    return this._repository.findOne({
      where: { user: { id: user.id }, revoked: false }
    });
  }

  async findByUserIncludingRevoked(
    user: UserEntity,
    clearToken: string
  ): Promise<RefreshTokenEntity | null> {
    const tokens = await this._repository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' }
    });

    for (const token of tokens) {
      const match = await this._hashService.verify(token.tokenHash, clearToken);
      if (match) {
        return token;
      }
    }

    return null;
  }

  async verify(
    refreshToken: RefreshTokenEntity,
    clearToken: string,
    user: UserEntity
  ): Promise<boolean> {
    if (refreshToken.revoked) {
      await this._handleTokenReuse(refreshToken, user);
    }

    if (DateTime.fromJSDate(refreshToken.expiredAt) < DateTime.utc()) {
      return false;
    }
    return this._hashService.verify(refreshToken.tokenHash, clearToken);
  }

  async revokeAllForUser(user: UserEntity): Promise<void> {
    await this._repository.update({ user, revoked: false }, { revoked: true });
  }

  async resetReuseCounter(userId: string): Promise<void> {
    await this._redis.del(TOKEN_REUSE_KEY(userId));
  }

  async revokeFamily(family: string): Promise<void> {
    await this._repository.update(
      { family, revoked: false },
      { revoked: true }
    );
  }

  async rotate(
    refreshToken: RefreshTokenEntity,
    user: UserEntity
  ): Promise<string> {
    // Revoke the current refresh token
    await this._repository.update(refreshToken.id, { revoked: true });

    // Generate a new refresh token in the same family
    const clearToken = randomBytes(32).toString('hex');
    const tokenHash = await this._hashService.hash(clearToken);

    await this._repository.save(
      this._repository.create({
        user,
        tokenHash,
        family: refreshToken.family,
        expiredAt: refreshToken.expiredAt
      })
    );

    return clearToken;
  }

  private async _handleTokenReuse(
    token: RefreshTokenEntity,
    user: UserEntity
  ): Promise<void> {
    await this.revokeFamily(token.family);

    // Track token reuse count
    const key = TOKEN_REUSE_KEY(user.id);
    const count = await this._redis.incr(key);

    if (count === 1) {
      await this._redis.expire(key, this._tenantConfig.tokenReuseWindowSec);
    }

    if (count >= this._tenantConfig.tokenReuseMaxCompromisedFamilies) {
      await this._userEntityService.lock(user, LockReason.SuspiciousActivity);
    }

    throw new TokenReuseDetectedException();
  }
}

export class TokenReuseDetectedException extends UnauthorizedException {
  constructor() {
    super('Invalid or expired refresh token');
  }
}
