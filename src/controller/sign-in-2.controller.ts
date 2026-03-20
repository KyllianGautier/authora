import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import { Delay } from '../decorator/delay.decorator';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthThrottleGuard } from '../config/auth-throttle.guard';
import { CreateSessionInputDto } from '../dto/input/create-session.input.dto';
import { SessionPasswordInputDto } from '../dto/input/session-password.input.dto';
import { SessionMagicLinkInputDto } from '../dto/input/session-magic-link.input.dto';
import { SessionMagicLinkValidateInputDto } from '../dto/input/session-magic-link-validate.input.dto';
import { SessionTotpValidateInputDto } from '../dto/input/session-totp-validate.input.dto';
import { SessionExchangeInputDto } from '../dto/input/session-exchange.input.dto';
import { SessionTokenInputDto } from '../dto/input/session-token.input.dto';
import { AuthSessionStatusOutputDto } from '../dto/output/auth-session-status.output.dto';
import { SignInOutputDto } from '../dto/output/sign-in.output.dto';
import { SignIn2Service } from '../service/sign-in-2.service';

@ApiTags('Sign-in 2')
@Controller('auth/sign-in-2')
export class SignIn2Controller {
  constructor(private readonly _signIn2Service: SignIn2Service) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new auth session' })
  @ApiCreatedResponse({ description: 'Session created', type: AuthSessionStatusOutputDto })
  async createSession(
    @Body() dto: CreateSessionInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._signIn2Service.createSession(dto);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('primary/password')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ description: 'Password verified', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthPassword(
    @Body() dto: SessionPasswordInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._signIn2Service.primaryAuthPassword(dto.sessionId, dto);
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
    @Body() dto: SessionMagicLinkInputDto
  ): Promise<{ message: string }> {
    await this._signIn2Service.primaryAuthMagicLink(dto.sessionId, dto);
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
    @Query() dto: SessionMagicLinkValidateInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._signIn2Service.primaryAuthMagicLinkValidate(dto.sessionId, dto);
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
    @Body() dto: SessionTotpValidateInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._signIn2Service.mfaAuthTotpValidate(dto.sessionId, dto);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post('exchange')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange session for a one-time exchange token' })
  @ApiOkResponse({ description: 'Exchange token generated' })
  @ApiUnauthorizedResponse({ description: 'Authentication incomplete' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async exchange(
    @Body() dto: SessionExchangeInputDto
  ): Promise<{ exchangeToken: string }> {
    const exchangeToken = await this._signIn2Service.exchange(dto.sessionId);
    return { exchangeToken };
  }

  @Post('token')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a one-time token for access and refresh tokens' })
  @ApiOkResponse({ description: 'Tokens generated', type: SignInOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired exchange token' })
  async token(
    @Body() dto: SessionTokenInputDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    const { refreshToken, ...body } = await this._signIn2Service.token(
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
}
