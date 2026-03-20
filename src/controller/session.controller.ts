import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { AuthThrottleGuard } from '../config/auth-throttle.guard';
import { CreateSessionInputDto } from '../dto/input/create-session.input.dto';
import { SessionPasswordInputDto } from '../dto/input/session-password.input.dto';
import { SessionMagicLinkInputDto } from '../dto/input/session-magic-link.input.dto';
import { SessionMagicLinkValidateInputDto } from '../dto/input/session-magic-link-validate.input.dto';
import { SessionTotpValidateInputDto } from '../dto/input/session-totp-validate.input.dto';
import { AuthSessionStatusOutputDto } from '../dto/output/auth-session-status.output.dto';
import { SessionService } from '../service/session.service';

@ApiTags('Auth Session')
@Controller('auth/session')
export class SessionController {
  constructor(private readonly _sessionService: SessionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new auth session' })
  @ApiCreatedResponse({ description: 'Session created', type: AuthSessionStatusOutputDto })
  async createSession(
    @Body() dto: CreateSessionInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._sessionService.createSession(dto);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post(':id/primary/password')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ description: 'Password verified', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthPassword(
    @Param('id') id: string,
    @Body() dto: SessionPasswordInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._sessionService.primaryAuthPassword(id, dto);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post(':id/primary/magic-link')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a magic link' })
  @ApiAcceptedResponse({ description: 'Magic link sent if account exists' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthMagicLink(
    @Param('id') id: string,
    @Body() dto: SessionMagicLinkInputDto
  ): Promise<{ message: string }> {
    await this._sessionService.primaryAuthMagicLink(id, dto);
    return { message: 'If the account exists, the magic link will be sent via email' };
  }

  @Get(':id/primary/magic-link/validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @ApiOperation({ summary: 'Validate a magic link' })
  @ApiOkResponse({ description: 'Magic link validated', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async primaryAuthMagicLinkValidate(
    @Param('id') id: string,
    @Query() dto: SessionMagicLinkValidateInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._sessionService.primaryAuthMagicLinkValidate(id, dto);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post(':id/mfa/totp/validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate TOTP code for MFA' })
  @ApiOkResponse({ description: 'TOTP validated', type: AuthSessionStatusOutputDto })
  @ApiUnauthorizedResponse({ description: 'Invalid code or primary auth required' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async mfaAuthTotpValidate(
    @Param('id') id: string,
    @Body() dto: SessionTotpValidateInputDto
  ): Promise<AuthSessionStatusOutputDto> {
    const session = await this._sessionService.mfaAuthTotpValidate(id, dto);
    return AuthSessionStatusOutputDto.fromSession(session);
  }

  @Post(':id/exchange')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange session for a one-time exchange token' })
  @ApiOkResponse({ description: 'Exchange token generated' })
  @ApiUnauthorizedResponse({ description: 'Authentication incomplete' })
  @ApiNotFoundResponse({ description: 'Session not found or expired' })
  async exchange(
    @Param('id') id: string
  ): Promise<{ exchangeToken: string }> {
    const exchangeToken = await this._sessionService.exchange(id);
    return { exchangeToken };
  }
}
