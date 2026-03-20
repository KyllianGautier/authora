import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  JWT_ACCESS_TOKEN_EXPIRATION_SEC,
  JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SEC
} from '../config/constants';
import { OneTimeTokenType } from '../redis-model/one-time-token.model';
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
import { RefreshTokenEntityService } from './entity-service/refresh-token-entity.service';
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
    private readonly _emailService: EmailService,
    private readonly _jwtService: JwtService,
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

    const token = await this._oneTimeTokenRedisService.create(
      user.id,
      OneTimeTokenType.MagicLink
    );

    await this._emailService.sendMagicLink(email, token, sessionId, dto.locale);
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

    await this._oneTimeTokenRedisService.consume(
      user.id,
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

    if (
      session.mfaPolicy !== 'DISABLED' &&
      !session.mfaVerified &&
      !session.deviceTrusted
    ) {
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
    const exchangeToken = await this._oneTimeTokenRedisService.create(
      user.id,
      OneTimeTokenType.Exchange
    );

    // Consume the auth session
    await this._authSessionRedisService.delete(session);

    return exchangeToken;
  }

  async token(
    exchangeToken: string
  ): Promise<SignInOutputDto & { refreshToken: string }> {
    const userId =
      await this._oneTimeTokenRedisService.consumeExchangeToken(exchangeToken);

    const user = await this._userEntityService.findById(userId);

    if (user === null) {
      throw new InvalidCredentialsException();
    }

    // Generate the access token
    const accessToken = await this._jwtService.signAsync(
      { sub: user.id, email: user.email },
      { keyid: 'CHANGE_IT' }
    );

    // Generate the refresh token
    // TODO: use rememberMe from the consumed session to pick short/long expiration
    const refreshToken = await this._refreshTokenEntityService.create(
      user,
      JWT_REFRESH_TOKEN_SHORT_EXPIRATION_SEC
    );

    // Create an auth session to track the sign-in state
    const session = await this._authSessionRedisService.create({
      tenantId: 'default',
      userId: user.id,
      mode: 'first-party',
      primaryAuthVerified: true,
      mfaPolicy: 'DISABLED'
    });

    return {
      accessToken,
      type: 'Bearer',
      expiresIn: JWT_ACCESS_TOKEN_EXPIRATION_SEC,
      authSessionId: session.id,
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

    // Reuse detection: if the token was already revoked, an attacker is
    // replaying a stolen token → revoke the entire family
    if (matchedToken.revoked) {
      await this._refreshTokenEntityService.revokeFamily(matchedToken.family);
      throw new UnauthorizedException('Token reuse detected');
    }

    // Check expiration
    const isValid = await this._refreshTokenEntityService.verify(
      matchedToken,
      clearRefreshToken
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
      expiresIn: JWT_ACCESS_TOKEN_EXPIRATION_SEC,
      authSessionId: '',
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
      clearRefreshToken
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
