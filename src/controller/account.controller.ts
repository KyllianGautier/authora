import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards
} from '@nestjs/common';
import { Delay } from '../decorator/delay.decorator';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { AuthThrottleGuard } from '../config/auth-throttle.guard';
import { ChangePasswordInputDto } from '../dto/input/change-password.input.dto';
import { DeleteAccountInputDto } from '../dto/input/delete-account.input.dto';
import { ForgotPasswordInputDto } from '../dto/input/forgot-password.input.dto';
import { ForgotPasswordVerifyInputDto } from '../dto/input/forgot-password-verify.input.dto';
import { VerifyDeleteAccountInputDto } from '../dto/input/verify-delete-account.input.dto';
import { DeviceOutputDto } from '../dto/output/device.output.dto';
import { SessionOutputDto } from '../dto/output/session.output.dto';
import { AccountService } from '../service/account.service';

@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(private readonly _accountService: AccountService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'User profile' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async me(): Promise<void> {
    // TODO: implement with JWT auth guard
  }

  @Post('password/change')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password' })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({
    description: 'New password must be different or has already been used'
  })
  async passwordChange(@Body() dto: ChangePasswordInputDto): Promise<void> {
    return this._accountService.changePassword(dto);
  }

  @Post('password/change/mfa-validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate MFA code for password change' })
  @ApiOkResponse({ description: 'Password changed after MFA validation' })
  @ApiUnauthorizedResponse({ description: 'Invalid code' })
  async passwordChangeMfaValidate(): Promise<void> {
    // TODO: implement
  }

  @Post('password/forgot')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiAcceptedResponse({
    description: 'Reset email sent if account exists'
  })
  async passwordForgot(
    @Body() dto: ForgotPasswordInputDto
  ): Promise<{ message: string }> {
    await this._accountService.forgotPassword(dto);
    return { message: 'If the account exists, the reset email will be sent' };
  }

  @Post('password/reset')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or token' })
  @ApiBadRequestResponse({
    description: 'New password has already been used'
  })
  async passwordReset(
    @Body() dto: ForgotPasswordVerifyInputDto
  ): Promise<{ message: string }> {
    await this._accountService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  @Get('device')
  @ApiOperation({ summary: 'List all devices for the current user' })
  @ApiOkResponse({ description: 'List of devices', type: [DeviceOutputDto] })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listDevices(): Promise<DeviceOutputDto[]> {
    // TODO: get user from JWT auth guard
    const user = null as any;

    const devices = await this._accountService.listDevices(user);

    return devices.map(DeviceOutputDto.fromEntity);
  }

  @Post('device/:id/distrust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove trust from a device' })
  @ApiOkResponse({ description: 'Device distrusted', type: DeviceOutputDto })
  @ApiNotFoundResponse({ description: 'Device not found' })
  async distrustDevice(@Param('id') id: string): Promise<DeviceOutputDto> {
    // TODO: get user from JWT auth guard
    const user = null as any;

    const device = await this._accountService.distrustDevice(user, id);

    return DeviceOutputDto.fromEntity(device);
  }

  @Delete('device/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a device' })
  @ApiOkResponse({ description: 'Device deleted' })
  @ApiNotFoundResponse({ description: 'Device not found' })
  async deleteDevice(@Param('id') id: string): Promise<{ message: string }> {
    // TODO: get user from JWT auth guard
    const user = null as any;

    await this._accountService.deleteDevice(user, id);

    return { message: 'Device deleted' };
  }

  @Get('session')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  @ApiOkResponse({ description: 'List of active sessions', type: [SessionOutputDto] })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async listSessions(): Promise<SessionOutputDto[]> {
    // TODO: get user from JWT auth guard
    const user = null as any;

    const sessions = await this._accountService.listSessions(user);

    return sessions.map(SessionOutputDto.fromEntity);
  }

  @Post('session/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all active sessions' })
  @ApiOkResponse({ description: 'All sessions revoked' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async revokeAllSessions(): Promise<{ message: string }> {
    // TODO: get user from JWT auth guard
    const user = null as any;

    await this._accountService.revokeAllSessions(user);

    return { message: 'All sessions revoked' };
  }

  @Post('unlock')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlock a locked account' })
  @ApiOkResponse({ description: 'Account unlocked' })
  async unlock(): Promise<void> {
    // TODO: implement
  }

  @Post('delete')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account deletion' })
  @ApiOkResponse({ description: 'Verification email sent' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async deleteAccount(@Body() dto: DeleteAccountInputDto): Promise<void> {
    return this._accountService.deleteAccount(dto);
  }

  @Post('delete/validate')
  @Delay()
  @UseGuards(AuthThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and delete account' })
  @ApiOkResponse({ description: 'Account deleted' })
  @ApiUnauthorizedResponse({ description: 'Invalid token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async deleteAccountValidate(
    @Body() dto: VerifyDeleteAccountInputDto
  ): Promise<void> {
    return this._accountService.verifyDeleteAccount(dto);
  }
}
