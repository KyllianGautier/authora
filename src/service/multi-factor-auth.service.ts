import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { DisableMultiFactorAuthInputDto } from '../dto/input/disable-multi-factor-auth.input.dto';
import { SetupMultiFactorAuthInputDto } from '../dto/input/setup-multi-factor-auth.input.dto';
import { VerifyMultiFactorAuthInputDto } from '../dto/input/verify-multi-factor-auth.input.dto';
import { SetupMultiFactorAuthOutputDto } from '../dto/output/setup-multi-factor-auth.output.dto';
import { OneTimeTokenRedisService } from './redis-model-service/one-time-token-redis.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
import { MultiFactorAuthEntityService } from './entity-service/multi-factor-auth-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class MultiFactorAuthService {
  constructor(
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _refreshTokenEntityService: RefreshTokenEntityService,
    private readonly _oneTimeTokenRedisService: OneTimeTokenRedisService,
    private readonly _multiFactorAuthEntityService: MultiFactorAuthEntityService
  ) {}

  async setup(
    dto: SetupMultiFactorAuthInputDto
  ): Promise<SetupMultiFactorAuthOutputDto> {
    const email = dto.email.toLowerCase();

    // Find the user and verify the password
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const passwordResult =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (passwordResult === 'invalid') {
      throw new InvalidCredentialsException();
    }

    // Create a multi-factor authentication with a TOTP secret for the user
    const twoFactorAuth = await this._multiFactorAuthEntityService.create(user);

    // Generate the otpauth URI and the QR code
    const otpauthUri = this._multiFactorAuthEntityService.buildOtpauthUri(
      twoFactorAuth,
      email
    );

    const qrcode = await QRCode.toDataURL(otpauthUri);

    // Return the QR code and the manual code
    return { qrcode, manualCode: twoFactorAuth.secret };
  }

  async verify(dto: VerifyMultiFactorAuthInputDto): Promise<string[]> {
    const email = dto.email.toLowerCase();

    // Find the user and verify the password
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const passwordResult =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (passwordResult === 'invalid') {
      throw new InvalidCredentialsException();
    }

    // Verify the 6-digits code, enable MFA, and return the recovery codes
    return this._multiFactorAuthEntityService.verifyForUser(
      user,
      dto.code
    );
  }

  async disable(dto: DisableMultiFactorAuthInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    // Find the user and verify the password
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const passwordResult =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (passwordResult === 'invalid') {
      throw new InvalidCredentialsException();
    }

    // Verify the 6-digits code and remove the multi-factor authentication
    await this._multiFactorAuthEntityService.disableForUser(
      user,
      dto.code
    );

    // Revoke all sessions and one-time tokens
    await this._refreshTokenEntityService.revokeAllForUser(user);
    await this._oneTimeTokenRedisService.revokeAllForUser(user.id);
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}
