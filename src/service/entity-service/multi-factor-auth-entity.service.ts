import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import * as speakeasy from 'speakeasy';
import { Repository } from 'typeorm';
import { MultiFactorAuthEntity } from '../../entity/multi-factor-auth.entity';
import { UserEntity } from '../../entity/user.entity';
import { HashService } from '../hash.service';

const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Authora';

@Injectable()
export class MultiFactorAuthEntityService {
  constructor(
    @InjectRepository(MultiFactorAuthEntity)
    private readonly _repository: Repository<MultiFactorAuthEntity>,
    private readonly _hashService: HashService
  ) {}

  async create(user: UserEntity): Promise<MultiFactorAuthEntity> {
    const existing = await this._repository.findOne({
      where: { user: { id: user.id } }
    });

    if (existing !== null && existing.isVerified) {
      throw new MultiFactorAuthAlreadyEnabledException();
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
      throw new MultiFactorAuthNotFoundException();
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token: clearCode,
      window: 1
    });

    if (!isCodeValid) {
      throw new MultiFactorAuthCodeInvalidException();
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

  async validateTotpForUser(
    user: UserEntity,
    clearCode: string
  ): Promise<TotpValidateResult> {
    const twoFactorAuth = await this._repository.findOne({
      where: { user: { id: user.id }, isVerified: true }
    });

    if (twoFactorAuth === null) {
      return 'not_found';
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token: clearCode,
      window: 1
    });

    return isCodeValid ? 'valid' : 'invalid';
  }

  async disableForUser(
    user: UserEntity,
    clearCode: string
  ): Promise<void> {
    const twoFactorAuth = await this._repository.findOne({
      where: { user: { id: user.id }, isVerified: true }
    });

    if (twoFactorAuth === null) {
      throw new MultiFactorAuthNotFoundException();
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret,
      encoding: 'base32',
      token: clearCode,
      window: 1
    });

    if (!isCodeValid) {
      throw new MultiFactorAuthCodeInvalidException();
    }

    await this._repository.remove(twoFactorAuth);
  }

  buildOtpauthUri(twoFactorAuth: MultiFactorAuthEntity, email: string): string {
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

export class MultiFactorAuthAlreadyEnabledException extends ConflictException {
  constructor() {
    super('Multi-factor authentication is already enabled');
  }
}

export class MultiFactorAuthNotFoundException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export class MultiFactorAuthCodeInvalidException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export type TotpValidateResult = 'valid' | 'invalid' | 'not_found';
