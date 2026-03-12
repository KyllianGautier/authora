import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { ResendVerificationEmailInputDto } from '../dto/input/resend-verification-email.input.dto';
import { SignUpInputDto } from '../dto/input/sign-up.input.dto';
import { VerifyEmailInputDto } from '../dto/input/verify-email.input.dto';
import { SignUpOutputDto } from '../dto/output/sign-up.output.dto';
import { VerifyEmailOutputDto } from '../dto/output/verify-email.output.dto';
import { EmailService } from './email.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RegistrationEntityService } from './entity-service/registration-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class SignUpService {
  constructor(
    private readonly _registrationEntityService: RegistrationEntityService,
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _emailService: EmailService
  ) {}

  async signUp(dto: SignUpInputDto): Promise<SignUpOutputDto> {
    const email = dto.email.toLowerCase();

    // Check that the email is not already used in a registration or by a user
    const [emailInRegistration, emailInUser] = await Promise.all([
      this._registrationEntityService.existsByEmail(email),
      this._userEntityService.existsByEmail(email)
    ]);

    if (emailInRegistration || emailInUser) {
      throw new EmailAlreadyUsedException(email);
    }

    // Create a registration with hashed password and verification token
    const verificationToken = randomBytes(32).toString('hex');

    const registration = await this._registrationEntityService.create({
      email,
      clearPassword: dto.password,
      clearEmailVerificationToken: verificationToken
    });

    // Send the verification email
    await this._emailService.sendSignUpVerification(email, verificationToken);

    return SignUpOutputDto.fromEntity(registration);
  }

  async resendVerificationEmail(
    dto: ResendVerificationEmailInputDto
  ): Promise<void> {
    const email = dto.email.toLowerCase();

    // Find the existing registration
    const registration =
      await this._registrationEntityService.findByEmail(email);

    if (registration === null) {
      throw new RegistrationNotFoundException(email);
    }

    // Generate and store a new verification token
    const verificationToken = randomBytes(32).toString('hex');

    await this._registrationEntityService.updateEmailVerificationToken(
      registration,
      verificationToken
    );

    // Send the new verification email
    await this._emailService.sendSignUpVerification(email, verificationToken);
  }

  async verifyEmail(dto: VerifyEmailInputDto): Promise<VerifyEmailOutputDto> {
    const email = dto.email.toLowerCase();

    // Find the existing registration
    const registration =
      await this._registrationEntityService.findByEmail(email);

    if (registration === null) {
      throw new RegistrationNotFoundException(email);
    }

    // Check that the verification token is not expired
    const isTokenExpired =
      DateTime.utc() >
      DateTime.fromJSDate(registration.emailVerificationTokenExpiresAt);

    if (isTokenExpired) {
      throw new EmailVerificationTokenExpiredException();
    }

    // Validate the verification token
    const isTokenValid = await bcrypt.compare(
      dto.token,
      registration.emailVerificationTokenHash
    );

    if (!isTokenValid) {
      throw new EmailVerificationTokenInvalidException();
    }

    // Create the user and its password from the registration data
    const user = await this._userEntityService.create({ email });

    await this._passwordEntityService.createFromHash({
      user,
      passwordHash: registration.passwordHash
    });

    // Delete the registration
    await this._registrationEntityService.delete(registration);

    return VerifyEmailOutputDto.fromEntity(user);
  }
}

import {
  ConflictException,
  GoneException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';

export class EmailAlreadyUsedException extends ConflictException {
  constructor(email: string) {
    super(`Email '${email}' is already used`);
  }
}

export class RegistrationNotFoundException extends NotFoundException {
  constructor(email: string) {
    super(`No pending sign-up found for email '${email}'`);
  }
}

export class EmailVerificationTokenExpiredException extends GoneException {
  constructor() {
    super('Email verification token has expired');
  }
}

export class EmailVerificationTokenInvalidException extends UnauthorizedException {
  constructor() {
    super('Email verification token is invalid');
  }
}
