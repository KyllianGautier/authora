import {Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards} from '@nestjs/common';
import {Delay} from '../decorator/delay.decorator';
import {
    ApiAcceptedResponse,
    ApiBadRequestResponse,
    ApiGoneResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type {Request, Response} from 'express';
import {AuthThrottleGuard} from '../config/auth-throttle.guard';
import {ForgotPasswordInputDto} from '../dto/input/forgot-password.input.dto';
import {ForgotPasswordVerifyInputDto} from '../dto/input/forgot-password-verify.input.dto';
import {MagicLinkInputDto} from '../dto/input/magic-link.input.dto';
import {SignInInputDto} from '../dto/input/sign-in.input.dto';
import {ValidateMagicLinkInputDto} from '../dto/input/validate-magic-link.input.dto';
import {SignInOutputDto} from '../dto/output/sign-in.output.dto';
import {SignInService} from '../service/sign-in.service';

@ApiTags('Sign-in')
@Controller('sign-in')
export class SignInController {
  constructor(private readonly _signInService: SignInService) {}

  @Post()
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in' })
  @ApiOkResponse({
    description: 'Authenticated successfully',
    type: SignInOutputDto
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async signIn(
    @Body() dto: SignInInputDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    const { body, refreshToken } = await this._signInService.signIn(dto);

    this._setRefreshTokenCookie(res, refreshToken);

    return body;
  }

  @Post('refresh')
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({
    description: 'Tokens refreshed successfully',
    type: SignInOutputDto
  })
  @ApiBadRequestResponse({ description: 'Access token is not yet expired' })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired or revoked refresh token'
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    // Extract the access token from the Authorization header
    const authorization = req.headers.authorization;
    const accessToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;

    if (accessToken === undefined) {
      throw new UnauthorizedException('Missing access token');
    }

    // Extract the refresh token from the cookie
    const clearRefreshToken = req.cookies?.refreshToken;

    if (clearRefreshToken === undefined) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { body, refreshToken } = await this._signInService.refresh(
      accessToken,
      clearRefreshToken
    );

    this._setRefreshTokenCookie(res, refreshToken);

    return body;
  }

  @Post('magic-link')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a magic link' })
  @ApiAcceptedResponse({
    description: 'If the account exists, the magic link will be sent via email'
  })
  async magicLink(@Body() dto: MagicLinkInputDto): Promise<{ message: string }> {
    await this._signInService.magicLink(dto);

    return {
      message: 'If the account exists, the magic link will be sent via email'
    };
  }

  @Post('magic-link/validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a magic link' })
  @ApiOkResponse({
    description: 'Authenticated successfully',
    type: SignInOutputDto
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiGoneResponse({ description: 'Magic link has expired' })
  async validateMagicLink(
    @Body() dto: ValidateMagicLinkInputDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<SignInOutputDto> {
    const { body, refreshToken } =
      await this._signInService.validateMagicLink(dto);

    this._setRefreshTokenCookie(res, refreshToken);

    return body;
  }

  @Post('forgot-password')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset' })
  @ApiOkResponse({ description: 'Password reset email sent if account exists' })
  async forgotPassword(
    @Body() dto: ForgotPasswordInputDto
  ): Promise<{ message: string }> {
    await this._signInService.forgotPassword(dto);

    return {
      message:
        'If the account exists, the password reset email will be sent'
    };
  }

  @Post('forgot-password/verify')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  @ApiBadRequestResponse({
    description: 'New password has already been used'
  })
  async forgotPasswordVerify(
    @Body() dto: ForgotPasswordVerifyInputDto
  ): Promise<{ message: string }> {
    await this._signInService.forgotPasswordVerify(dto);

    return { message: 'Password reset successfully' };
  }

  private _setRefreshTokenCookie(res: Response, refreshToken: string): void {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });
  }
}
