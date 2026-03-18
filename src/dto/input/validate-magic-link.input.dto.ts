import { ValidateMagicLinkInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ValidateMagicLinkInputDto implements ValidateMagicLinkInput {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Magic link token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
