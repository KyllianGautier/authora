import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ChangePasswordInputDto } from '../dto/input/change-password.input.dto';
import { DeleteAccountInputDto } from '../dto/input/delete-account.input.dto';
import { ForgotPasswordInputDto } from '../dto/input/forgot-password.input.dto';
import { ForgotPasswordVerifyInputDto } from '../dto/input/forgot-password-verify.input.dto';
import { VerifyDeleteAccountInputDto } from '../dto/input/verify-delete-account.input.dto';
import { TENANT_CONFIG } from '../config/tenant-config';
import type { AuthoraTenantConfig } from '../config/tenant-config';
import { LockReason } from '../entity/user.entity';
import { OneTimeTokenType } from '../redis-model/one-time-token.model';
import { EmailService } from './email.service';
import { HashService } from './hash.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
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
    private readonly _hashService: HashService,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
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
      OneTimeTokenType.ForgotPassword
    );

    await this._emailService.sendForgotPassword(email, token);
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
    if (
      this._tenantConfig.unlockOnPasswordReset &&
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
      OneTimeTokenType.AccountDeletion
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
