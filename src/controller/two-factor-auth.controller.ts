import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Delay } from '../decorator/delay.decorator';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { AuthThrottleGuard } from '../config/auth-throttle.guard';
import { DisableTwoFactorAuthInputDto } from '../dto/input/disable-two-factor-auth.input.dto';
import { SetupTwoFactorAuthInputDto } from '../dto/input/setup-two-factor-auth.input.dto';
import { VerifyTwoFactorAuthInputDto } from '../dto/input/verify-two-factor-auth.input.dto';
import { SetupTwoFactorAuthOutputDto } from '../dto/output/setup-two-factor-auth.output.dto';
import { VerifyTwoFactorAuthOutputDto } from '../dto/output/verify-two-factor-auth.output.dto';
import { TwoFactorAuthService } from '../service/two-factor-auth.service';

@ApiTags('Two-Factor-Auth')
@Controller('2fa')
export class TwoFactorAuthController {
  constructor(private readonly _twoFactorAuthService: TwoFactorAuthService) {}

  @Post('setup')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Setup two-factor authentication' })
  @ApiOkResponse({
    description: 'Returns QR code and manual code for 2FA app',
    type: SetupTwoFactorAuthOutputDto
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiConflictResponse({
    description: 'Two-factor authentication is already enabled'
  })
  async setup(
    @Body() dto: SetupTwoFactorAuthInputDto
  ): Promise<SetupTwoFactorAuthOutputDto> {
    return this._twoFactorAuthService.setup(dto);
  }

  @Post('verify')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and enable two-factor authentication' })
  @ApiOkResponse({
    description: 'Two-factor authentication enabled, returns recovery codes',
    type: VerifyTwoFactorAuthOutputDto
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or verification code'
  })
  async verify(
    @Body() dto: VerifyTwoFactorAuthInputDto
  ): Promise<VerifyTwoFactorAuthOutputDto> {
    const recoveryCodes = await this._twoFactorAuthService.verify(dto);
    return { recoveryCodes };
  }

  @Post('disable')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable two-factor authentication' })
  @ApiOkResponse({
    description: 'Two-factor authentication disabled'
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials'
  })
  async disable(
    @Body() dto: DisableTwoFactorAuthInputDto
  ): Promise<{ message: string }> {
    await this._twoFactorAuthService.disable(dto);
    return { message: 'Two-factor authentication disabled' };
  }
}
