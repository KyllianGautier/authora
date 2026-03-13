import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Delay } from '../decorator/delay.decorator';
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
import { CheckEmailInputDto } from '../dto/input/check-email.input.dto';
import { ResendVerificationEmailInputDto } from '../dto/input/resend-verification-email.input.dto';
import { SignUpInputDto } from '../dto/input/sign-up.input.dto';
import { VerifyEmailInputDto } from '../dto/input/verify-email.input.dto';
import { CheckEmailOutputDto } from '../dto/output/check-email.output.dto';
import { SignUpOutputDto } from '../dto/output/sign-up.output.dto';
import { VerifyEmailOutputDto } from '../dto/output/verify-email.output.dto';
import { SignUpService } from '../service/sign-up.service';

@ApiTags('Sign-up')
@Controller('sign-up')
export class SignUpController {
  constructor(private readonly _signUpService: SignUpService) {}

  @Post()
  @Delay()
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
  @Delay()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification token' })
  @ApiOkResponse({ description: 'Verification email resent' })
  @ApiNotFoundResponse({ description: 'No pending sign-up found' })
  async resendVerificationEmail(
    @Body() dto: ResendVerificationEmailInputDto
  ): Promise<void> {
    return this._signUpService.resendVerificationEmail(dto);
  }

  @Post('check-email')
  @Delay()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if an email is available' })
  @ApiOkResponse({
    description: 'Email availability check result',
    type: CheckEmailOutputDto
  })
  async checkEmail(
    @Body() dto: CheckEmailInputDto
  ): Promise<CheckEmailOutputDto> {
    return this._signUpService.checkEmail(dto);
  }

  @Post('verify')
  @Delay()
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
