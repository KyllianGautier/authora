import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { SetupTwoFactorAuthInputDto } from '../dto/input/setup-two-factor-auth.input.dto';
import { VerifyTwoFactorAuthInputDto } from '../dto/input/verify-two-factor-auth.input.dto';
import { SetupTwoFactorAuthOutputDto } from '../dto/output/setup-two-factor-auth.output.dto';
import { PasswordEntityService } from './entity-service/password-entity.service';
import {
  TwoFactorAuthCodeInvalidException,
  TwoFactorAuthEntityService
} from './entity-service/two-factor-auth-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class TwoFactorAuthService {
  constructor(
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _twoFactorAuthEntityService: TwoFactorAuthEntityService
  ) {}

  async setup(
    dto: SetupTwoFactorAuthInputDto
  ): Promise<SetupTwoFactorAuthOutputDto> {
    const email = dto.email.toLowerCase();

    // Find the user and verify the password
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const isPasswordValid =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Create a two-factor authentication with a TOTP secret for the user
    const twoFactorAuth = await this._twoFactorAuthEntityService.create(user);

    // Generate the otpauth URI and the QR code
    const otpauthUri = this._twoFactorAuthEntityService.buildOtpauthUri(
      twoFactorAuth,
      email
    );

    const qrcode = await QRCode.toDataURL(otpauthUri);

    // Return the QR code and the manual code
    return { qrcode, manualCode: twoFactorAuth.secret };
  }

  async verify(dto: VerifyTwoFactorAuthInputDto): Promise<string[]> {
    const email = dto.email.toLowerCase();

    // Find the user and verify the password
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const isPasswordValid =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Verify the 6-digits code from the 2FA app against the stored secret
    const isCodeValid =
      await this._twoFactorAuthEntityService.verifyUserTwoFactorAuth(
        user,
        dto.code
      );

    if (!isCodeValid) {
      throw new TwoFactorAuthCodeInvalidException();
    }

    // Enable two-factor authentication and return the recovery codes
    return this._twoFactorAuthEntityService.enableForUser(user);
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}
