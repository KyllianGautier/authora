import { VerifyDeleteAccountInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyDeleteAccountInputDto implements VerifyDeleteAccountInput {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Account deletion verification token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
