import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { ChangePasswordInputDto } from '../dto/input/change-password.input.dto';
import { DeleteAccountInputDto } from '../dto/input/delete-account.input.dto';
import { VerifyDeleteAccountInputDto } from '../dto/input/verify-delete-account.input.dto';
import { AuthService } from '../service/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly _authService: AuthService) {}

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password' })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({
    description: 'New password must be different or has already been used'
  })
  async changePassword(@Body() dto: ChangePasswordInputDto): Promise<void> {
    return this._authService.changePassword(dto);
  }

  @Post('delete-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account deletion' })
  @ApiOkResponse({ description: 'Verification email sent' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async deleteAccount(@Body() dto: DeleteAccountInputDto): Promise<void> {
    return this._authService.deleteAccount(dto);
  }

  @Post('delete-account/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and delete account' })
  @ApiOkResponse({ description: 'Account deleted' })
  @ApiNotFoundResponse({ description: 'No pending account deletion found' })
  @ApiGoneResponse({ description: 'Verification token has expired' })
  @ApiUnauthorizedResponse({ description: 'Verification token is invalid' })
  async verifyDeleteAccount(
    @Body() dto: VerifyDeleteAccountInputDto
  ): Promise<void> {
    return this._authService.verifyDeleteAccount(dto);
  }
}
