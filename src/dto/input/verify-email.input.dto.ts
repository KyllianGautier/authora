import { VerifyEmailInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailInputDto implements VerifyEmailInput {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Email verification token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
