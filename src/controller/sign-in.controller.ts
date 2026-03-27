import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { Delay } from '../decorator/delay.decorator';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthThrottleGuard } from '../config/auth-throttle.guard';
import { TenantSetting } from '../config/settings';
import { CurrentTenant } from '../decorator/current-tenant.decorator';
import { SignInAuthorizeInputDto } from '../dto/input/sign-in-authorize.input.dto';
import { SignInExchangeInputDto } from '../dto/input/sign-in-exchange.input.dto';
import { SignInExchangeSessionInputDto } from '../dto/input/sign-in-exchange-session.input.dto';
import { SignInMagicLinkInputDto } from '../dto/input/sign-in-magic-link.input.dto';
import { SignInMagicLinkValidateInputDto } from '../dto/input/sign-in-magic-link-validate.input.dto';
import { SignInPasswordInputDto } from '../dto/input/sign-in-password.input.dto';
import { SignInTokenInputDto } from '../dto/input/sign-in-token.input.dto';
import { SignInTotpValidateInputDto } from '../dto/input/sign-in-totp-validate.input.dto';
import { AuthSessionStatusOutputDto } from '../dto/output/auth-session-status.output.dto';
import { SignInOutputDto } from '../dto/output/sign-in.output.dto';
import { TenantEntity } from '../entity/tenant.entity';
import { SettingsService } from '../service/settings.service';
import { SignInService } from '../service/sign-in.service';

@ApiTags('Sign-in')
@Controller('auth/sign-in')
export class SignInController {
  constructor(
    private readonly _signInService: SignInService,
    private readonly _settingsService: SettingsService
  ) {}

  // ── First-party ────────────────────────────────────

  @Post('initiate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a first-party sign-in session' })
  @ApiCreatedResponse({ description: 'Session created', type: AuthSessionStatusOutputDto })
  @ApiBadRequestResponse({ description: 'Missing X-Device-Fingerprint cookie' })
  async initiate(
    @CurrentTenant() tenant: TenantEntity,
    @Req() req: Request
  ): Promise<AuthSessionStatusOutputDto> {
    const deviceFingerprint = req.cookies?.['X-Device-Fingerprint'] as string | undefined;

    if (deviceFingerprint === undefined) {
      throw new BadRequestException('Missing X-Device-Fingerprint cookie');
    }

    const session = await this._signInService.createFirstPartySession(tenant, deviceFingerprint);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('exchange-session')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a completed session for access and refresh tokens',
    description: 'First-party integration mode only. Not available in third-party mode.'
  })
  @ApiOkResponse({ description: 'Tokens generated', type: SignInOutputDto })
  @ApiUnauthorizedResponse({ description: 'Authentication incomplete' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async exchangeSession(
    @Body() dto: SignInExchangeSessionInputDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    const { refreshToken, ...body } = await this._signInService.exchangeSession(dto.sessionId);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    return body;
  }

  // ── Third-party ────────────────────────────────────

  @Get('authorize')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a third-party sign-in session (OAuth/PKCE)' })
  @ApiCreatedResponse({ description: 'Session created', type: AuthSessionStatusOutputDto })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async authorize(
    @Query() dto: SignInAuthorizeInputDto,
    @CurrentTenant() tenant: TenantEntity
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._signInService.createThirdPartySession(tenant, dto.redirectUri, dto.codeChallenge);

    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('exchange')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange session for a one-time exchange token',
    description: 'Third-party integration mode only. Not available in first-party mode.'
  })
  @ApiOkResponse({ description: 'Exchange token generated' })
  @ApiUnauthorizedResponse({ description: 'Authentication incomplete' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async exchange(
    @Body() dto: SignInExchangeInputDto
  ): Promise<{ exchangeToken: string }> {
    const exchangeToken = await this._signInService.exchange(dto.sessionId);
    return { exchangeToken };
  }

  @Post('token')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a one-time token for access and refresh tokens',
    description: 'Third-party integration mode only. Not available in first-party mode.'
  })
  @ApiOkResponse({ description: 'Tokens generated', type: SignInOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired exchange token' })
  async token(
    @Body() dto: SignInTokenInputDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    const { refreshToken, ...body } = await this._signInService.token(
      dto.exchangeToken
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    return body;
  }

  // ── Shared ─────────────────────────────────────────

  @Post('primary/password')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ description: 'Password verified', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthPassword(
    @Body() dto: SignInPasswordInputDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthSessionStatusOutputDto> {
    const { deviceFingerprint, ...session } =
      await this._signInService.primaryAuthPassword(
        dto.sessionId,
        dto,
        req.ip ?? '',
        req.headers['user-agent'] ?? '',
        req.cookies?.deviceFingerprint as string | undefined
      );

    await this._setDeviceFingerprintCookie(res, deviceFingerprint, session.tenantId);

    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('primary/magic-link')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a magic link' })
  @ApiAcceptedResponse({ description: 'Magic link sent if account exists' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthMagicLink(
    @Body() dto: SignInMagicLinkInputDto
  ): Promise<{ message: string }> {
    await this._signInService.primaryAuthMagicLink(dto.sessionId, dto);
    return { message: 'If the account exists, the magic link will be sent via email' };
  }

  @Get('primary/magic-link/validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @ApiOperation({ summary: 'Validate a magic link' })
  @ApiOkResponse({ description: 'Magic link validated', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthMagicLinkValidate(
    @Query() dto: SignInMagicLinkValidateInputDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<AuthSessionStatusOutputDto> {
    const { deviceFingerprint, ...session } =
      await this._signInService.primaryAuthMagicLinkValidate(
        dto.sessionId,
        dto,
        req.ip ?? '',
        req.headers['user-agent'] ?? '',
        req.cookies?.deviceFingerprint as string | undefined
      );

    await this._setDeviceFingerprintCookie(res, deviceFingerprint, session.tenantId);

    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('mfa/totp/validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate TOTP code for MFA' })
  @ApiOkResponse({ description: 'TOTP validated', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid code or primary auth required' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async mfaAuthTotpValidate(
    @Body() dto: SignInTotpValidateInputDto,
    @Req() req: Request
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._signInService.mfaAuthTotpValidate(
      dto.sessionId, dto, req.ip ?? '', req.headers['user-agent'] ?? ''
    );
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiOkResponse({ description: 'Tokens refreshed', type: SignInOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const clearRefreshToken = req.cookies?.refreshToken as string | undefined;

    const { refreshToken, ...body } =
      await this._signInService.refreshToken(accessToken, clearRefreshToken);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    return body;
  }

  @Post('token/revoke')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token (sign out)' })
  @ApiOkResponse({ description: 'Token revoked' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async revokeToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ message: string }> {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const clearRefreshToken = req.cookies?.refreshToken as string | undefined;

    await this._signInService.revokeToken(accessToken, clearRefreshToken);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    return { message: 'Token revoked' };
  }

  // ── Private ────────────────────────────────────────

  private async _setDeviceFingerprintCookie(
    res: Response,
    fingerprint: string,
    tenantId: string
  ): Promise<void> {
    const maxAgeDays = await this._settingsService.get(
      TenantSetting.DeviceFingerprintCookieMaxAgeDays, tenantId
    );

    res.cookie('deviceFingerprint', fingerprint, {
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeDays * 24 * 60 * 60 * 1_000
    });
  }
}
