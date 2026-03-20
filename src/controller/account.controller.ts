import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
