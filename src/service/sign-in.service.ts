import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OneTimeTokenType } from '../entity/one-time-token.entity';
import { ForgotPasswordInputDto } from '../dto/input/forgot-password.input.dto';
import { ForgotPasswordVerifyInputDto } from '../dto/input/forgot-password-verify.input.dto';
import { MagicLinkInputDto } from '../dto/input/magic-link.input.dto';
import { SignInInputDto } from '../dto/input/sign-in.input.dto';
import { ValidateMagicLinkInputDto } from '../dto/input/validate-magic-link.input.dto';
import { SignInOutputDto } from '../dto/output/sign-in.output.dto';
import { EmailService } from './email.service';
import { HashService } from './hash.service';
import { OneTimeTokenEntityService } from './entity-service/one-time-token-entity.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';
import { AuthSessionRedisService } from './redis-model-service/auth-session-redis.service';

export interface SignInResult {
  body: SignInOutputDto;
  refreshToken: string;
}

@Injectable()
export class SignInService {
  constructor(
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _refreshTokenEntityService: RefreshTokenEntityService,
    private readonly _oneTimeTokenEntityService: OneTimeTokenEntityService,
    private readonly _authSessionRedisService: AuthSessionRedisService,
    private readonly _emailService: EmailService,
    private readonly _hashService: HashService,
    private readonly _jwtService: JwtService,
    private readonly _configService: ConfigService
  ) {}

  async signIn(dto: SignInInputDto): Promise<SignInResult> {
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

    // Generate the access token
    const expiresIn = this._configService.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_EXPIRATION_SECONDS'
    );

    const accessToken = await this._jwtService.signAsync({
      sub: user.id,
      email: user.email
    });

    // Generate the refresh token with expiration based on rememberMe
    const refreshTokenExpirationSeconds =
      this._configService.getOrThrow<number>(
        dto.rememberMe
          ? 'JWT_REFRESH_TOKEN_LONG_EXPIRATION_SECONDS'
          : 'JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SECONDS'
      );

    const refreshToken = await this._refreshTokenEntityService.create(
      user,
      refreshTokenExpirationSeconds
    );

    // Create an auth session to track the sign-in state
    const session = await this._authSessionRedisService.create({
      tenantId: 'default',
      userId: user.id,
      mode: 'first-party',
      primaryAuthVerified: true,
      rememberMe: dto.rememberMe ?? false,
      mfaPolicy: 'DISABLED'
    });

    return {
      body: { accessToken, type: 'Bearer', expiresIn, authSessionId: session.id },
      refreshToken
    };
  }

  async refresh(
    accessToken: string,
    clearRefreshToken: string
  ): Promise<SignInResult> {
    // Verify the JWT is expired — if still valid, the client should use it
    const payload = this._verifyExpiredToken(accessToken);

    if (payload === null) {
      throw new BadRequestException('Access token is not yet expired');
    }

    // Find the user
    const user = await this._userEntityService.findById(payload.sub);

    if (user === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find the active refresh token for this user
    const refreshToken =
      await this._refreshTokenEntityService.findActiveForUser(user);

    if (refreshToken === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Verify the refresh token hash and expiration
    const isValid = await this._refreshTokenEntityService.verify(
      refreshToken,
      clearRefreshToken
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new access token
    const expiresIn = this._configService.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_EXPIRATION_SECONDS'
    );

    const newAccessToken = await this._jwtService.signAsync({
      sub: user.id,
      email: user.email
    });

    // Rotate the refresh token (same expiration date as the previous one)
    const newRefreshToken = await this._refreshTokenEntityService.rotate(
      refreshToken,
      user
    );

    // Find the existing auth session for the user
    const session = await this._authSessionRedisService.findActiveForUserId(user.id);

    return {
      body: {
        accessToken: newAccessToken,
        type: 'Bearer',
        expiresIn,
        authSessionId: session?.id ?? ''
      },
      refreshToken: newRefreshToken
    };
  }

  async forgotPassword(dto: ForgotPasswordInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmail(email);

    if (user === null) {
      return;
    }

    const token = await this._oneTimeTokenEntityService.create(
      user,
      OneTimeTokenType.ForgotPassword
    );

    await this._emailService.sendForgotPassword(email, token);
  }

  async forgotPasswordVerify(
    dto: ForgotPasswordVerifyInputDto
  ): Promise<void> {
    const email = dto.email.toLowerCase();

    const user =
      await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Verify the forgot password token
    await this._oneTimeTokenEntityService.verifyToken(
      user,
      dto.token,
      OneTimeTokenType.ForgotPassword
    );

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
    await this._passwordEntityService.updateUserPassword(
      user,
      dto.newPassword
    );

    // Invalidate all active sessions and one-time tokens
    await this._refreshTokenEntityService.revokeAllForUser(user);
    await this._oneTimeTokenEntityService.revokeAllForUser(user);
  }

  async magicLink(dto: MagicLinkInputDto): Promise<void> {
    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmail(email);

    // Silently ignore if user does not exist to avoid enumeration
    if (user === null) {
      return;
    }

    const token = await this._oneTimeTokenEntityService.create(
      user,
      OneTimeTokenType.MagicLink
    );

    await this._emailService.sendMagicLink(email, token, dto.redirectTo, dto.locale);
  }

  async validateMagicLink(
    dto: ValidateMagicLinkInputDto
  ): Promise<SignInResult> {
    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmail(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    await this._oneTimeTokenEntityService.verifyToken(
      user,
      dto.token,
      OneTimeTokenType.MagicLink
    );

    // Generate the access token
    const expiresIn = this._configService.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_EXPIRATION_SECONDS'
    );

    const accessToken = await this._jwtService.signAsync({
      sub: user.id,
      email: user.email
    });

    // Generate the refresh token with magic link expiration
    const refreshTokenExpirationSeconds =
      this._configService.getOrThrow<number>(
        'MAGIC_LINK_REFRESH_TOKEN_EXPIRATION_SECONDS'
      );

    const refreshToken = await this._refreshTokenEntityService.create(
      user,
      refreshTokenExpirationSeconds
    );

    // Create an auth session to track the magic link sign-in state
    const session = await this._authSessionRedisService.create({
      tenantId: 'default',
      userId: user.id,
      mode: 'first-party',
      primaryAuthVerified: true,
      rememberMe: false,
      mfaPolicy: 'DISABLED'
    });

    return {
      body: { accessToken, type: 'Bearer', expiresIn, authSessionId: session.id },
      refreshToken
    };
  }

  private _verifyExpiredToken(
    token: string
  ): { sub: string; email: string } | null {
    try {
      // If verification succeeds, the token is still valid
      this._jwtService.verify(token);
      return null;
    } catch (error) {
      // Only accept TokenExpiredError — any other error means the token is invalid
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        return this._jwtService.verify<{ sub: string; email: string }>(token, {
          ignoreExpiration: true
        });
      }
      throw new UnauthorizedException('Invalid access token');
    }
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
