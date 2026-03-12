import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { ResendVerificationEmailInputDto } from '../dto/input/resend-verification-email.input.dto';
import { SignUpInputDto } from '../dto/input/sign-up.input.dto';
import { VerifyEmailInputDto } from '../dto/input/verify-email.input.dto';
import { SignUpOutputDto } from '../dto/output/sign-up.output.dto';
import { VerifyEmailOutputDto } from '../dto/output/verify-email.output.dto';
import { SignUpService } from '../service/sign-up.service';

@ApiTags('Sign-up')
@Controller('sign-up')
export class SignUpController {
  constructor(private readonly _signUpService: SignUpService) {}

  @Post()
  @ApiOperation({ summary: 'Create a registration' })
  @ApiCreatedResponse({
    description: 'Registration created',
    type: SignUpOutputDto
  })
  @ApiConflictResponse({ description: 'Email is already used' })
  async signUp(@Body() dto: SignUpInputDto): Promise<SignUpOutputDto> {
    return this._signUpService.signUp(dto);
  }

  @Post('resend-verification-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification token' })
  @ApiOkResponse({ description: 'Verification email resent' })
  @ApiNotFoundResponse({ description: 'No pending sign-up found' })
  async resendVerificationEmail(
    @Body() dto: ResendVerificationEmailInputDto
  ): Promise<void> {
    return this._signUpService.resendVerificationEmail(dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email and create user' })
  @ApiOkResponse({
    description: 'Email verified and user created',
    type: VerifyEmailOutputDto
  })
  @ApiNotFoundResponse({ description: 'No pending sign-up found' })
  @ApiGoneResponse({ description: 'Verification token has expired' })
  @ApiUnauthorizedResponse({ description: 'Verification token is invalid' })
  async verifyEmail(
    @Body() dto: VerifyEmailInputDto
  ): Promise<VerifyEmailOutputDto> {
    return this._signUpService.verifyEmail(dto);
  }
}
