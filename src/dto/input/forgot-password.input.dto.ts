import { ForgotPasswordInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordInputDto implements ForgotPasswordInput {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;
}
