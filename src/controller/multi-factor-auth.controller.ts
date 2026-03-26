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
import { DisableMultiFactorAuthInputDto } from '../dto/input/disable-multi-factor-auth.input.dto';
import { SetupMultiFactorAuthInputDto } from '../dto/input/setup-multi-factor-auth.input.dto';
import { VerifyMultiFactorAuthInputDto } from '../dto/input/verify-multi-factor-auth.input.dto';
import { SetupMultiFactorAuthOutputDto } from '../dto/output/setup-multi-factor-auth.output.dto';
import { VerifyMultiFactorAuthOutputDto } from '../dto/output/verify-multi-factor-auth.output.dto';
import { MultiFactorAuthService } from '../service/multi-factor-auth.service';

@ApiTags('Multi-Factor-Auth')
@Controller('mfa')
export class MultiFactorAuthController {
  constructor(private readonly _multiFactorAuthService: MultiFactorAuthService) {}

  @Post('setup')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Setup multi-factor authentication' })
  @ApiOkResponse({
    description: 'Returns QR code and manual code for MFA app',
    type: SetupMultiFactorAuthOutputDto
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiConflictResponse({
    description: 'Multi-factor authentication is already enabled'
  })
  async setup(
    @Body() dto: SetupMultiFactorAuthInputDto
  ): Promise<SetupMultiFactorAuthOutputDto> {
    return this._multiFactorAuthService.setup(dto);
  }

  @Post('verify')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and enable multi-factor authentication' })
  @ApiOkResponse({
    description: 'Multi-factor authentication enabled, returns recovery codes',
    type: VerifyMultiFactorAuthOutputDto
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or verification code'
  })
  async verify(
    @Body() dto: VerifyMultiFactorAuthInputDto
  ): Promise<VerifyMultiFactorAuthOutputDto> {
    const recoveryCodes = await this._multiFactorAuthService.verify(dto);
    return { recoveryCodes };
  }

  @Post('disable')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable multi-factor authentication' })
  @ApiOkResponse({
    description: 'Multi-factor authentication disabled'
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials'
  })
  async disable(
    @Body() dto: DisableMultiFactorAuthInputDto
  ): Promise<{ message: string }> {
    await this._multiFactorAuthService.disable(dto);
    return { message: 'Multi-factor authentication disabled' };
  }
}
