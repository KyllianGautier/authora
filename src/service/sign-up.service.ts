import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { CheckEmailInputDto } from '../dto/input/check-email.input.dto';
import { ResendVerificationEmailInputDto } from '../dto/input/resend-verification-email.input.dto';
import { SignUpInputDto } from '../dto/input/sign-up.input.dto';
import { VerifyEmailInputDto } from '../dto/input/verify-email.input.dto';
import { CheckEmailOutputDto } from '../dto/output/check-email.output.dto';
import { SignUpOutputDto } from '../dto/output/sign-up.output.dto';
import { VerifyEmailOutputDto } from '../dto/output/verify-email.output.dto';
import { EmailService } from './email.service';
import { HashService } from './hash.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RegistrationEntityService } from './entity-service/registration-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class SignUpService {
  constructor(
    private readonly _registrationEntityService: RegistrationEntityService,
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _emailService: EmailService,
    private readonly _hashService: HashService
  ) {}

  async signUp(dto: SignUpInputDto, tenant: TenantEntity): Promise<SignUpOutputDto> {
    const email = dto.email.toLowerCase();

    // Check that the email is not already used in a registration or by a user
    const [emailInRegistration, emailInUser] = await Promise.all([
      this._registrationEntityService.existsByEmail(email, tenant),
      this._userEntityService.existsByEmail(email, tenant)
    ]);

    if (emailInRegistration || emailInUser) {
      throw new EmailAlreadyUsedException(email);
    }

    // Create a registration with hashed password and verification token
    const verificationToken = randomBytes(32).toString('hex');

    const registration = await this._registrationEntityService.create({
      email,
      tenant,
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

  async checkEmail(dto: CheckEmailInputDto, tenant: TenantEntity): Promise<CheckEmailOutputDto> {
    const email = dto.email.toLowerCase();

    const [emailInRegistration, emailInUser] = await Promise.all([
      this._registrationEntityService.existsByEmail(email, tenant),
      this._userEntityService.existsByEmail(email, tenant)
    ]);

    if (emailInRegistration || emailInUser) {
      return { message: 'If the email can be used, you will be able to sign-up.' };
    }

    return { message: 'You can continue the registration process if this email is valid.' };
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
      throw new InvalidTokenException();
    }

    // Validate the verification token
    const isTokenValid = await this._hashService.verify(
      registration.emailVerificationTokenHash,
      dto.token
    );

    if (!isTokenValid) {
      throw new InvalidTokenException();
    }

    // Create the user and its password from the registration data
    const user = await this._userEntityService.create({ email, tenant: registration.tenant });

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
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { TenantEntity } from '../entity/tenant.entity';

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

export class InvalidTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid token');
  }
}
