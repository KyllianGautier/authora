import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OneTimeTokenType } from '../entity/one-time-token.entity';
import { TwoFactorAuthEntity } from '../entity/two-factor-auth.entity';
import { UserEntity } from '../entity/user.entity';
import { AuthSession, MfaPolicy } from '../redis-model/auth-session.model';
import { CreateSessionInputDto } from '../dto/input/create-session.input.dto';
import { SessionPasswordInputDto } from '../dto/input/session-password.input.dto';
import { SessionMagicLinkInputDto } from '../dto/input/session-magic-link.input.dto';
import { SessionMagicLinkValidateInputDto } from '../dto/input/session-magic-link-validate.input.dto';
import { SessionTotpValidateInputDto } from '../dto/input/session-totp-validate.input.dto';
import { AuthSessionRedisService } from './redis-model-service/auth-session-redis.service';
import { EmailService } from './email.service';
import { OneTimeTokenEntityService } from './entity-service/one-time-token-entity.service';
import { PasswordEntityService } from './entity-service/password-entity.service';
import { TwoFactorAuthEntityService } from './entity-service/two-factor-auth-entity.service';
import { UserEntityService } from './entity-service/user-entity.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly _authSessionRedisService: AuthSessionRedisService,
    private readonly _userEntityService: UserEntityService,
    private readonly _passwordEntityService: PasswordEntityService,
    private readonly _oneTimeTokenEntityService: OneTimeTokenEntityService,
    private readonly _twoFactorAuthEntityService: TwoFactorAuthEntityService,
    private readonly _emailService: EmailService,
    @InjectRepository(TwoFactorAuthEntity)
    private readonly _twoFactorAuthRepository: Repository<TwoFactorAuthEntity>
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
    dto: SessionPasswordInputDto
  ): Promise<AuthSession> {
    const session = await this._getSession(sessionId);

    const email = dto.email.toLowerCase();

    const user = await this._userEntityService.findByEmailWithPasswords(email);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    const isPasswordValid =
      await this._passwordEntityService.verifyUserPassword(user, dto.password);

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Update the session with user info and primary auth status
    session.userId = user.id;
    session.primaryAuthVerified = true;
    session.rememberMe = dto.rememberMe ?? false;

    // Resolve MFA status for the user
    await this._resolveMfaStatus(session, user);

    await this._authSessionRedisService.update(session);

    return session;
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

    const token = await this._oneTimeTokenEntityService.create(
      user,
      OneTimeTokenType.MagicLink
    );

    await this._emailService.sendMagicLink(
      email,
      token,
      sessionId,
      dto.locale
    );
  }

  async primaryAuthMagicLinkValidate(
    sessionId: string,
    dto: SessionMagicLinkValidateInputDto
  ): Promise<AuthSession> {
    const session = await this._getSession(sessionId);

    if (session.userId === undefined) {
      throw new InvalidCredentialsException();
    }

    const user = await this._userEntityService.findById(session.userId);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    await this._oneTimeTokenEntityService.verifyToken(
      user,
      dto.token,
      OneTimeTokenType.MagicLink
    );

    // Mark primary auth as verified and resolve MFA status
    session.primaryAuthVerified = true;
    await this._resolveMfaStatus(session, user);

    await this._authSessionRedisService.update(session);

    return session;
  }

  async mfaAuthTotpValidate(
    sessionId: string,
    dto: SessionTotpValidateInputDto
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

    await this._twoFactorAuthEntityService.validateTotpForUser(user, dto.code);

    session.mfaVerified = true;
    await this._authSessionRedisService.update(session);

    return session;
  }

  async exchange(sessionId: string): Promise<string> {
    const session = await this._getSession(sessionId);

    if (!session.primaryAuthVerified) {
      throw new UnauthorizedException('Primary authentication required');
    }

    if (session.mfaPolicy !== 'DISABLED' && !session.mfaVerified && !session.deviceTrusted) {
      throw new UnauthorizedException('MFA verification required');
    }

    if (session.userId === undefined) {
      throw new InvalidCredentialsException();
    }

    const user = await this._userEntityService.findById(session.userId);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Create an exchange OTT
    const exchangeToken = await this._oneTimeTokenEntityService.create(
      user,
      OneTimeTokenType.Exchange
    );

    // Consume the auth session
    await this._authSessionRedisService.delete(session);

    return exchangeToken;
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
    user: UserEntity
  ): Promise<void> {
    const twoFactorAuth = await this._twoFactorAuthRepository.findOne({
      where: { user: { id: user.id } }
    });

    const hasVerifiedMfa = twoFactorAuth !== null && twoFactorAuth.isVerified;

    session.mfaSetup = hasVerifiedMfa;

    // TODO: mfaPolicy should come from tenant/app config
    // For now, keep the default from session creation
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export class SessionNotFoundException extends NotFoundException {
  constructor() {
    super('Session not found or expired');
  }
}
