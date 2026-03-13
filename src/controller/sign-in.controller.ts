import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common';
import { Delay } from '../decorator/delay.decorator';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SignInInputDto } from '../dto/input/sign-in.input.dto';
import { SignInOutputDto } from '../dto/output/sign-in.output.dto';
import { SignInService } from '../service/sign-in.service';

@ApiTags('Sign-in')
@Controller('sign-in')
export class SignInController {
  constructor(private readonly _signInService: SignInService) {}

  @Post()
  @Delay()
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

  private _setRefreshTokenCookie(res: Response, refreshToken: string): void {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });
  }
}
