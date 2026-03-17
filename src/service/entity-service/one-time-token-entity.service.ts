import {
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import {
  OneTimeTokenEntity,
  OneTimeTokenType
} from '../../entity/one-time-token.entity';
import { UserEntity } from '../../entity/user.entity';
import { HashService } from '../hash.service';

const EXPIRATION_CONFIG_KEYS: Record<OneTimeTokenType, string> = {
  [OneTimeTokenType.AccountDeletion]:
    'ACCOUNT_DELETION_TOKEN_EXPIRATION_SECONDS',
  [OneTimeTokenType.TwoFactorAuthVerify]:
    'TWO_FACTOR_AUTH_VERIFY_TOKEN_EXPIRATION_SECONDS',
  [OneTimeTokenType.TwoFactorAuthValidate]:
    'TWO_FACTOR_AUTH_VALIDATE_TOKEN_EXPIRATION_SECONDS',
  [OneTimeTokenType.TwoFactorAuthDisabling]:
    'TWO_FACTOR_AUTH_DISABLING_TOKEN_EXPIRATION_SECONDS',
  [OneTimeTokenType.ForgotPassword]:
    'FORGOT_PASSWORD_TOKEN_EXPIRATION_SECONDS',
  [OneTimeTokenType.MagicLink]: 'MAGIC_LINK_TOKEN_EXPIRATION_SECONDS'
};

@Injectable()
export class OneTimeTokenEntityService {
  constructor(
    @InjectRepository(OneTimeTokenEntity)
    private readonly _repository: Repository<OneTimeTokenEntity>,
    private readonly _configService: ConfigService,
    private readonly _hashService: HashService
  ) {}

  async create(user: UserEntity, type: OneTimeTokenType): Promise<string> {
    const clearToken = randomBytes(32).toString('hex');

    await this._create(user, type, clearToken);

    return clearToken;
  }

  private async _create(
      user: UserEntity,
      type: OneTimeTokenType,
      clearToken: string
  ): Promise<OneTimeTokenEntity> {
    await this._repository.delete({
      user: { id: user.id },
      type
    });

    const tokenHash: string = await this._hashService.hash(clearToken);

    return this._repository.save(
      this._repository.create({
        user,
        type,
        tokenHash,
        expiredAt: this._computeExpiresAt(type)
      })
    );
  }

  async verifyToken(
    user: UserEntity,
    clearToken: string,
    type: OneTimeTokenType
  ): Promise<void> {
    const token = user.oneTimeTokens.find((ott) => ott.type === type);

    if (token === undefined) {
      throw new InvalidTokenException();
    }

    if (
      token.revoked ||
      DateTime.utc() > DateTime.fromJSDate(token.expiredAt)
    ) {
      throw new InvalidTokenException();
    }

    const isTokenValid = await this._hashService.verify(token.tokenHash, clearToken);

    if (!isTokenValid) {
      throw new InvalidTokenException();
    }

    await this._repository.update(token.id, { revoked: true });
  }

  async revokeAllForUser(user: UserEntity): Promise<void> {
    await this._repository.update(
      { user: { id: user.id }, revoked: false },
      { revoked: true }
    );
  }

  private _computeExpiresAt(type: OneTimeTokenType): Date {
    const expirationSeconds = this._configService.get<number>(
      EXPIRATION_CONFIG_KEYS[type]
    );
    return DateTime.utc().plus({ seconds: expirationSeconds }).toJSDate();
  }
}

export class InvalidTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid token');
  }
}
