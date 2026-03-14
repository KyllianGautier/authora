import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import * as speakeasy from 'speakeasy';
import { Repository } from 'typeorm';
import { TwoFactorAuthEntity } from '../../entity/two-factor-auth.entity';
import { UserEntity } from '../../entity/user.entity';
import { HashService } from '../hash.service';

const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Authora';

@Injectable()
export class TwoFactorAuthEntityService {
  constructor(
    @InjectRepository(TwoFactorAuthEntity)
    private readonly _repository: Repository<TwoFactorAuthEntity>,
    private readonly _hashService: HashService
  ) {}

  async create(user: UserEntity): Promise<TwoFactorAuthEntity> {
    const existing = await this._repository.findOne({
      where: { user: { id: user.id } }
    });

    if (existing !== null && existing.isVerified) {
      throw new TwoFactorAuthAlreadyEnabledException();
    }

    if (existing !== null) {
      await this._repository.remove(existing);
    }

    const { base32: secret } = speakeasy.generateSecret({
      name: `${TOTP_ISSUER}:${user.email}`,
      issuer: TOTP_ISSUER
    });

    return this._repository.save(
      this._repository.create({
        user,
        secret,
        isVerified: false,
        recoveryCodeHashes: []
      })
    );
  }

  async verifyForUser(
    user: UserEntity,
    clearCode: string
  ): Promise<string[]> {
    const twoFactorAuth = await this._repository.findOne({
      where: { user: { id: user.id } }
    });

    if (twoFactorAuth === null) {
      throw new TwoFactorAuthNotFoundException();
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token: clearCode,
      window: 1
    });

    if (!isCodeValid) {
      throw new TwoFactorAuthCodeInvalidException();
    }

    const clearRecoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      this._generateRecoveryCode()
    );

    const recoveryCodeHashes = await Promise.all(
      clearRecoveryCodes.map((code) => this._hashService.hash(code))
    );

    twoFactorAuth.isVerified = true;
    twoFactorAuth.recoveryCodeHashes = recoveryCodeHashes;
    await this._repository.save(twoFactorAuth);

    return clearRecoveryCodes;
  }

  async disableForUser(
    user: UserEntity,
    clearCode: string
  ): Promise<void> {
    const twoFactorAuth = await this._repository.findOne({
      where: { user: { id: user.id }, isVerified: true }
    });

    if (twoFactorAuth === null) {
      throw new TwoFactorAuthNotFoundException();
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token: clearCode,
      window: 1
    });

    if (!isCodeValid) {
      throw new TwoFactorAuthCodeInvalidException();
    }

    await this._repository.remove(twoFactorAuth);
  }

  buildOtpauthUri(twoFactorAuth: TwoFactorAuthEntity, email: string): string {
    return speakeasy.otpauthURL({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      label: email,
      issuer: TOTP_ISSUER
    });
  }

  private _generateRecoveryCode(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const bytes = randomBytes(8);
    const part1 = Array.from(bytes.subarray(0, 4), (b) => chars[b % chars.length]).join('');
    const part2 = Array.from(bytes.subarray(4, 8), (b) => chars[b % chars.length]).join('');
    return `${part1}-${part2}`;
  }
}

export class TwoFactorAuthAlreadyEnabledException extends ConflictException {
  constructor() {
    super('Two-factor authentication is already enabled');
  }
}

export class TwoFactorAuthNotFoundException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export class TwoFactorAuthCodeInvalidException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}
