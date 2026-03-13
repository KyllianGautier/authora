import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { RefreshTokenEntity } from '../../entity/refresh-token.entity';
import { UserEntity } from '../../entity/user.entity';
import { HashService } from '../hash.service';

@Injectable()
export class RefreshTokenEntityService {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly _repository: Repository<RefreshTokenEntity>,
    private readonly _hashService: HashService
  ) {}

  async create(
    user: UserEntity,
    expirationSeconds: number
  ): Promise<string> {
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
        expiredAt
      })
    );

    return clearToken;
  }

  async findActiveByUser(userId: string): Promise<RefreshTokenEntity | null> {
    return this._repository.findOne({
      where: { user: { id: userId }, revoked: false }
    });
  }

  async verify(
    refreshToken: RefreshTokenEntity,
    clearToken: string
  ): Promise<boolean> {
    if (DateTime.fromJSDate(refreshToken.expiredAt) < DateTime.utc()) {
      return false;
    }
    return this._hashService.verify(refreshToken.tokenHash, clearToken);
  }

  async rotate(
    refreshToken: RefreshTokenEntity,
    user: UserEntity
  ): Promise<string> {
    // Revoke the current refresh token
    await this._repository.update(refreshToken.id, { revoked: true });

    // Generate a new refresh token with the same expiration date
    const clearToken = randomBytes(32).toString('hex');
    const tokenHash = await this._hashService.hash(clearToken);

    await this._repository.save(
      this._repository.create({
        user,
        tokenHash,
        expiredAt: refreshToken.expiredAt
      })
    );

    return clearToken;
  }
}
