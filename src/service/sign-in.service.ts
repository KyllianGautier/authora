import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TENANT_CONFIG } from '../config/tenant-config';
import type { AuthoraTenantConfig } from '../config/tenant-config';
import { LockReason } from '../entity/user.entity';
import { AuthFailureReason } from '../entity/sign-in-attempt.entity';
import { SignInAttemptEntityService } from './entity-service/sign-in-attempt-entity.service';
import { OneTimeTokenType } from '../redis-model/one-time-token.model';
import { TrustedDeviceEntity } from '../entity/trusted-device.entity';
import { TwoFactorAuthEntity } from '../entity/two-factor-auth.entity';
import { UserEntity } from '../entity/user.entity';
import { AuthSession } from '../redis-model/auth-session.model';
import { CreateSessionInputDto } from '../dto/input/create-session.input.dto';
import { SessionPasswordInputDto } from '../dto/input/session-password.input.dto';
import { SessionMagicLinkInputDto } from '../dto/input/session-magic-link.input.dto';
import { SessionMagicLinkValidateInputDto } from '../dto/input/session-magic-link-validate.input.dto';
import { SessionTotpValidateInputDto } from '../dto/input/session-totp-validate.input.dto';
import { SignInOutputDto } from '../dto/output/sign-in.output.dto';
import { AuthSessionRedisService } from './redis-model-service/auth-session-redis.service';
import { EmailService } from './email.service';
import { OneTimeTokenRedisService } from './redis-model-service/one-time-token-redis.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { PasswordRevocationReason } from '../entity/password.entity';
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
import { TrustedDeviceEntityService } from './entity-service/trusted-device-entity.service';
import { TwoFactorAuthEntityService } from './entity-service/two-factor-auth-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class SignInService {
  constructor(
    private readonly _authSessionRedisService: AuthSessionRedisService,
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _oneTimeTokenRedisService: OneTimeTokenRedisService,
    private readonly _refreshTokenEntityService: RefreshTokenEntityService,
    private readonly _twoFactorAuthEntityService: TwoFactorAuthEntityService,
    private readonly _signInAttemptEntityService: SignInAttemptEntityService,
    private readonly _trustedDeviceEntityService: TrustedDeviceEntityService,
    private readonly _emailService: EmailService,
    private readonly _jwtService: JwtService,
    @InjectRepository(TwoFactorAuthEntity)
    private readonly _twoFactorAuthRepository: Repository<TwoFactorAuthEntity>,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  async createSession(dto: CreateSessionInputDto): Promise<AuthSession> {
    return this._authSessionRedisService.create({
      tenantId: dto.tenantId,
      mode: 'first-party',
      primaryAuthVerified: false,
      mfaPolicy: 'DISABLED'
    });
  }

  async primaryAuthPassword(
    sessionId: string,
    dto: SessionPasswordInputDto,
    ip: string,
    userAgent: string,
    deviceFingerprint: string | undefined
  ): Promise<AuthSession & { deviceFingerprint: string }> {
    const session = await this._getSession(sessionId);

    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    if (user.isLocked) {
      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.AccountLocked
      );
      throw new InvalidCredentialsException();
    }

    if (this._userEntityService.isPasswordTemporarilyLocked(user)) {
      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.TooManyAttempts
      );
      throw new TooManyAttemptsException();
    }

    const passwordResult =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (passwordResult === 'expired') {
      await this._passwordEntityService.revoke(user, PasswordRevocationReason.Expired);
      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.PasswordExpired
      );
      throw new PasswordExpiredHttpException();
    }

    if (passwordResult === 'invalid') {
      const attempts =
        await this._userEntityService.recordFailedPasswordAttempt(user);

      if (attempts >= this._tenantConfig.primaryAuthLockAccountThreshold) {
        await this._userEntityService.lock(user, LockReason.TooManyAttempts);
      }

      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.InvalidPasswordAuth
      );
      throw new InvalidCredentialsException();
    }

    // Reset failed attempts on successful login
    await this._userEntityService.resetPasswordAttempts(user);

    await this._signInAttemptEntityService.create(user, ip, userAgent, true);

    // Register or update the trusted device
    const { device, fingerprint } =
      await this._trustedDeviceEntityService.registerOrUpdate(
        user, deviceFingerprint, ip, userAgent
      );

    // Update the session with user info and primary auth status
    session.userId = user.id;
    session.primaryAuthVerified = true;
    session.rememberMe = dto.rememberMe ?? false;
    session.deviceFingerprint = fingerprint;

    // Resolve MFA status for the user
    await this._resolveMfaStatus(session, user, device);

    await this._authSessionRedisService.update(session);

    return { ...session, deviceFingerprint: fingerprint };
  }

  async primaryAuthMagicLink(
    sessionId: string,
    dto: SessionMagicLinkInputDto
  ): Promise<void> {
    const session = await this._getSession(sessionId);

    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmail(email);

    // Silently ignore if user does not exist to avoid enumeration
    if (user === null) {
      return;
    }

    // Store the userId in the session (not yet verified)
    session.userId = user.id;
    await this._authSessionRedisService.update(session);

    const token = await this._oneTimeTokenRedisService.create(
      user.id,
      OneTimeTokenType.MagicLink
    );

    await this._emailService.sendMagicLink(email, token, sessionId, dto.locale);
  }

  async primaryAuthMagicLinkValidate(
    sessionId: string,
    dto: SessionMagicLinkValidateInputDto,
    ip: string,
    userAgent: string,
    deviceFingerprint: string | undefined
  ): Promise<AuthSession & { deviceFingerprint: string }> {
    const session = await this._getSession(sessionId);

    if (session.userId === undefined) {
      throw new InvalidCredentialsException();
    }

    const user = await this._userEntityService.findById(session.userId);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    await this._oneTimeTokenRedisService.consume(
      user.id,
      dto.token,
      OneTimeTokenType.MagicLink
    );

    // Register or update the trusted device
    const { device, fingerprint } =
      await this._trustedDeviceEntityService.registerOrUpdate(
        user, deviceFingerprint, ip, userAgent
      );

    // Mark primary auth as verified and resolve MFA status
    session.primaryAuthVerified = true;
    session.deviceFingerprint = fingerprint;
    await this._resolveMfaStatus(session, user, device);

    await this._authSessionRedisService.update(session);

    return { ...session, deviceFingerprint: fingerprint };
  }

  async mfaAuthTotpValidate(
    sessionId: string,
    dto: SessionTotpValidateInputDto,
    ip: string,
    userAgent: string
  ): Promise<AuthSession> {
    const session = await this._getSession(sessionId);

    if (session.userId === undefined) {
      throw new InvalidCredentialsException();
    }

    if (!session.primaryAuthVerified) {
      throw new UnauthorizedException('Primary authentication required');
    }

    const user = await this._userEntityService.findById(session.userId);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    if (user.isLocked) {
      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.AccountLocked
      );
      throw new InvalidCredentialsException();
    }

    if (this._userEntityService.isMfaTemporarilyLocked(user)) {
      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.TooManyMfaAttempts
      );
      throw new TooManyAttemptsException();
    }

    const totpResult =
      await this._twoFactorAuthEntityService.validateTotpForUser(user, dto.code);

    if (totpResult === 'not_found') {
      throw new InvalidCredentialsException();
    }

    if (totpResult === 'invalid') {
      await this._userEntityService.recordFailedMfaAttempt(user);
      await this._signInAttemptEntityService.create(
        user, ip, userAgent, false, AuthFailureReason.InvalidMfaAuth
      );
      throw new InvalidCredentialsException();
    }

    // Reset failed attempts on successful validation
    await this._userEntityService.resetMfaAttempts(user);

    await this._signInAttemptEntityService.create(user, ip, userAgent, true);

    session.mfaVerified = true;

    // Trust the device if requested
    if (dto.trustThisDevice === true && session.deviceFingerprint !== undefined) {
      const device = await this._trustedDeviceEntityService.findByFingerprint(
        user, session.deviceFingerprint
      );

      if (device !== null) {
        await this._trustedDeviceEntityService.trust(device);
        session.deviceTrusted = true;
      }
    }

    await this._authSessionRedisService.update(session);

    return session;
  }

  async exchange(sessionId: string): Promise<string> {
    const session = await this._getSession(sessionId);

    if (!session.primaryAuthVerified) {
      throw new UnauthorizedException('Primary authentication required');
    }

    if (
      session.mfaPolicy !== 'DISABLED' &&
      !session.mfaVerified &&
      !session.deviceTrusted
    ) {
      throw new UnauthorizedException('MFA verification required');
    }

    if (session.exchanged) {
      throw new SessionNotFoundException();
    }

    if (session.userId === undefined) {
      throw new InvalidCredentialsException();
    }

    const user = await this._userEntityService.findById(session.userId);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Create an exchange OTT linked to the session
    const exchangeToken =
      await this._oneTimeTokenRedisService.createExchangeToken(
        user.id,
        session.id
      );

    // Mark the session as exchanged
    session.exchanged = true;
    await this._authSessionRedisService.update(session);

    return exchangeToken;
  }

  async token(
    exchangeToken: string
  ): Promise<SignInOutputDto & { refreshToken: string }> {
    const consumedSession =
      await this._oneTimeTokenRedisService.consumeExchangeToken(exchangeToken);

    const user = await this._userEntityService.findById(consumedSession.userId!);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Generate the access token
    const accessToken = await this._jwtService.signAsync(
      { sub: user.id, email: user.email },
      { keyid: 'CHANGE_IT' }
    );

    // Generate the refresh token with expiration based on rememberMe
    const refreshTokenExpirationSeconds = consumedSession.rememberMe
      ? this._tenantConfig.jwtRefreshTokenLongExpirationSec
      : this._tenantConfig.jwtRefreshTokenShortExpirationSec;

    const refreshToken = await this._refreshTokenEntityService.create(
      user,
      refreshTokenExpirationSeconds
    );

    return {
      accessToken,
      type: 'Bearer',
      expiresIn: this._tenantConfig.jwtAccessTokenExpirationSec,
      refreshToken
    };
  }

  async refreshToken(
    accessToken: string | undefined,
    clearRefreshToken: string | undefined
  ): Promise<SignInOutputDto & { refreshToken: string }> {
    if (!accessToken || !clearRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    // Decode the (potentially expired) access token to get the userId
    let userId: string;
    try {
      const payload = this._jwtService.decode(accessToken);
      userId = payload.sub as string;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (!userId) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this._userEntityService.findById(userId);

    if (user === null) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Look up the token across all tokens (including revoked) to detect reuse
    const matchedToken =
      await this._refreshTokenEntityService.findByUserIncludingRevoked(
        user,
        clearRefreshToken
      );

    if (matchedToken === null) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Verify the token (also handles reuse detection)
    const isValid = await this._refreshTokenEntityService.verify(
      matchedToken,
      clearRefreshToken,
      user
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate the refresh token (revoke old, create new in the same family)
    const newRefreshToken = await this._refreshTokenEntityService.rotate(
      matchedToken,
      user
    );

    // Generate a new access token
    const newAccessToken = await this._jwtService.signAsync(
      { sub: user.id, email: user.email },
      { keyid: 'CHANGE_IT' }
    );

    return {
      accessToken: newAccessToken,
      type: 'Bearer',
      expiresIn: this._tenantConfig.jwtAccessTokenExpirationSec,
      refreshToken: newRefreshToken
    };
  }

  async revokeToken(
    accessToken: string | undefined,
    clearRefreshToken: string | undefined
  ): Promise<void> {
    if (!accessToken || !clearRefreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let userId: string;
    try {
      const payload = this._jwtService.decode(accessToken);
      userId = payload.sub as string;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (!userId) {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this._userEntityService.findById(userId);

    if (user === null) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const activeToken =
      await this._refreshTokenEntityService.findActiveForUser(user);

    if (activeToken === null) {
      return;
    }

    const isValid = await this._refreshTokenEntityService.verify(
      activeToken,
      clearRefreshToken,
      user
    );

    if (!isValid) {
      return;
    }

    // Revoke the entire family
    await this._refreshTokenEntityService.revokeFamily(activeToken.family);
  }

  private async _getSession(sessionId: string): Promise<AuthSession> {
    const session = await this._authSessionRedisService.findById(sessionId);

    if (session === null) {
      throw new SessionNotFoundException();
    }

    await this._authSessionRedisService.verify(session);

    return session;
  }

  private async _resolveMfaStatus(
    session: AuthSession,
    user: UserEntity,
    device: TrustedDeviceEntity
  ): Promise<void> {
    const twoFactorAuth = await this._twoFactorAuthRepository.findOne({
      where: { user: { id: user.id } }
    });

    const hasVerifiedMfa = twoFactorAuth !== null && twoFactorAuth.isVerified;

    session.mfaSetup = hasVerifiedMfa;
    session.mfaPolicy = this._tenantConfig.mfaPolicy;
    session.deviceTrusted = this._trustedDeviceEntityService.isTrusted(device);
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export class TooManyAttemptsException extends HttpException {
  constructor() {
    super('Too many attempts, try again later', HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class PasswordExpiredHttpException extends UnauthorizedException {
  constructor() {
    super({ message: 'Password expired', nextStep: 'reset_password' });
  }
}

export class SessionNotFoundException extends NotFoundException {
  constructor() {
    super('Session not found or expired');
  }
}
