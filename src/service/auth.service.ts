import { Injectable } from '@nestjs/common';
import { ChangePasswordInputDto } from '../dto/input/change-password.input.dto';
import { DeleteAccountInputDto } from '../dto/input/delete-account.input.dto';
import { VerifyDeleteAccountInputDto } from '../dto/input/verify-delete-account.input.dto';
import { OneTimeTokenType } from '../entity/one-time-token.entity';
import { EmailService } from './email.service';
import { HashService } from './hash.service';
import { OneTimeTokenEntityService } from './entity-service/one-time-token-entity.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _oneTimeTokenEntityService: OneTimeTokenEntityService,
    private readonly _emailService: EmailService,
    private readonly _hashService: HashService
  ) {}

  async changePassword(dto: ChangePasswordInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    // Find the user with all their passwords
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Verify the current password
    const isCurrentPasswordValid =
      await this._passwordEntityService.verifyUserPassword(
        user,
        dto.currentPassword
      );

    if (!isCurrentPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Check that the new password has not been used before
    const isNewPasswordAlreadyUsed = await Promise.all(
      user.passwords.map((password) =>
        this._hashService.verify(password.passwordHash, dto.newPassword)
      )
    );

    if (isNewPasswordAlreadyUsed.some((match) => match)) {
      throw new PasswordAlreadyUsedException();
    }

    // Revoke the current password and create the new one
    await this._passwordEntityService.updateUserPassword(user, dto.newPassword);
  }

  async deleteAccount(dto: DeleteAccountInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    // Find the user with all their passwords
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Verify the password
    const isPasswordValid =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Create a one-time token for account deletion verification
    const verificationToken = await this._oneTimeTokenEntityService.create(
      user,
      OneTimeTokenType.AccountDeletion
    );

    // Send the verification email
    await this._emailService.sendAccountDeletionVerification(
      email,
      verificationToken
    );
  }

  async verifyDeleteAccount(dto: VerifyDeleteAccountInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    // Find the user
    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new AccountDeletionNotFoundException(email);
    }

    // Verify the account deletion token
    await this._oneTimeTokenEntityService.verifyToken(
      user,
      dto.token,
      OneTimeTokenType.AccountDeletion
    );

    // Delete the user and all related data
    await this._userEntityService.delete(user);
  }
}

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';

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
