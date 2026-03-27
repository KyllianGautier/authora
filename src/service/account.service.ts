import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ChangePasswordInputDto } from '../dto/input/change-password.input.dto';
import { DeleteAccountInputDto } from '../dto/input/delete-account.input.dto';
import { ForgotPasswordInputDto } from '../dto/input/forgot-password.input.dto';
import { ForgotPasswordVerifyInputDto } from '../dto/input/forgot-password-verify.input.dto';
import { VerifyDeleteAccountInputDto } from '../dto/input/verify-delete-account.input.dto';
import { TenantSetting } from '../config/settings';
import { SettingsService } from './settings.service';
import { LockReason } from '../entity/user.entity';
import { OneTimeTokenType } from '../redis-model/one-time-token.model';
import { EmailService } from './email.service';
import { HashService } from './hash.service';
import { RefreshTokenEntity } from '../entity/refresh-token.entity';
import { TrustedDeviceEntity } from '../entity/trusted-device.entity';
import { UserEntity } from '../entity/user.entity';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
import { TrustedDeviceEntityService } from './entity-service/trusted-device-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';
import { OneTimeTokenRedisService } from './redis-model-service/one-time-token-redis.service';

@Injectable()
export class AccountService {
  constructor(
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _refreshTokenEntityService: RefreshTokenEntityService,
    private readonly _oneTimeTokenRedisService: OneTimeTokenRedisService,
    private readonly _emailService: EmailService,
    private readonly _trustedDeviceEntityService: TrustedDeviceEntityService,
    private readonly _hashService: HashService,
    private readonly _settingsService: SettingsService
  ) {}

  async changePassword(dto: ChangePasswordInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const passwordResult =
      await this._passwordEntityService.verifyUserPassword(
        user,
        dto.currentPassword
      );

    if (passwordResult === 'invalid') {
      throw new InvalidCredentialsException();
    }

    const isNewPasswordAlreadyUsed = await Promise.all(
      user.passwords.map((password) =>
        this._hashService.verify(password.passwordHash, dto.newPassword)
      )
    );

    if (isNewPasswordAlreadyUsed.some((match) => match)) {
      throw new PasswordAlreadyUsedException();
    }

    await this._passwordEntityService.changeUserPassword(
      user,
      dto.newPassword
    );

    await this._refreshTokenEntityService.revokeAllForUser(user);
    await this._oneTimeTokenRedisService.revokeAllForUser(user.id);
  }

  async forgotPassword(dto: ForgotPasswordInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmail(email);

    if (user === null) {
      return;
    }

    const token = await this._oneTimeTokenRedisService.create(
      user.id,
      OneTimeTokenType.ForgotPassword,
      user.tenant?.id ?? ''
    );

    await this._emailService.sendForgotPassword(email, token, user.tenant?.id ?? '');
  }

  async resetPassword(dto: ForgotPasswordVerifyInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user =
      await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    await this._oneTimeTokenRedisService.consume(
      user.id,
      dto.token,
      OneTimeTokenType.ForgotPassword
    );

    const isNewPasswordAlreadyUsed = await Promise.all(
      user.passwords.map((password) =>
        this._hashService.verify(password.passwordHash, dto.newPassword)
      )
    );

    if (isNewPasswordAlreadyUsed.some((match) => match)) {
      throw new PasswordAlreadyUsedException();
    }

    await this._passwordEntityService.resetUserPassword(
      user,
      dto.newPassword
    );

    // Unlock the account if it was locked due to too many failed attempts
    const unlockOnPasswordReset = await this._settingsService.get(
      TenantSetting.UnlockOnPasswordReset, user.tenant?.id ?? ''
    );

    if (
      unlockOnPasswordReset &&
      user.isLocked &&
      user.lockReason === LockReason.TooManyAttempts
    ) {
      await this._userEntityService.unlock(user);
      await this._userEntityService.resetPasswordAttempts(user);
      await this._userEntityService.resetMfaAttempts(user);
      await this._refreshTokenEntityService.resetReuseCounter(user.id);
    }

    await this._refreshTokenEntityService.revokeAllForUser(user);
    await this._oneTimeTokenRedisService.revokeAllForUser(user.id);
  }

  async deleteAccount(dto: DeleteAccountInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user =
      await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const passwordResult =
      await this._passwordEntityService.verifyUserPassword(
        user,
        dto.password
      );

    if (passwordResult === 'invalid') {
      throw new InvalidCredentialsException();
    }

    const verificationToken = await this._oneTimeTokenRedisService.create(
      user.id,
      OneTimeTokenType.AccountDeletion,
      user.tenant?.id ?? ''
    );

    await this._emailService.sendAccountDeletionVerification(
      email,
      verificationToken
    );
  }

  async verifyDeleteAccount(dto: VerifyDeleteAccountInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user =
      await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new AccountDeletionNotFoundException(email);
    }

    await this._oneTimeTokenRedisService.consume(
      user.id,
      dto.token,
      OneTimeTokenType.AccountDeletion
    );

    await this._userEntityService.delete(user);
  }

  async listDevices(user: UserEntity): Promise<TrustedDeviceEntity[]> {
    return this._trustedDeviceEntityService.findAllForUser(user);
  }

  async distrustDevice(user: UserEntity, deviceId: string): Promise<TrustedDeviceEntity> {
    const device = await this._trustedDeviceEntityService.findById(deviceId);

    if (device === null || device.user?.id !== user.id) {
      throw new DeviceNotFoundException();
    }

    await this._trustedDeviceEntityService.distrust(device);

    device.trusted = false;
    device.trustedUntil = null;

    return device;
  }

  async listSessions(user: UserEntity): Promise<RefreshTokenEntity[]> {
    return this._refreshTokenEntityService.findAllActiveForUser(user);
  }

  async revokeAllSessions(user: UserEntity): Promise<void> {
    await this._refreshTokenEntityService.revokeAllForUser(user);
  }

  async deleteDevice(user: UserEntity, deviceId: string): Promise<void> {
    const device = await this._trustedDeviceEntityService.findById(deviceId);

    if (device === null || device.user?.id !== user.id) {
      throw new DeviceNotFoundException();
    }

    await this._trustedDeviceEntityService.delete(device);
  }
}

export class DeviceNotFoundException extends NotFoundException {
  constructor() {
    super('Device not found');
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export class PasswordAlreadyUsedException extends BadRequestException {
  constructor() {
    super('New password has already been used');
  }
}

export class AccountDeletionNotFoundException extends NotFoundException {
  constructor(email: string) {
    super(`No pending account deletion found for email '${email}'`);
  }
}
