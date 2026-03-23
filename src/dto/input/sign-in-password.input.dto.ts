import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { SignInPasswordInput } from '@kylliangautier/authora-types';

export class SignInPasswordInputDto implements SignInPasswordInput {
  @ApiProperty({ description: 'Auth session id' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Clear text password', example: 'P@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Extend refresh token duration', example: false })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
