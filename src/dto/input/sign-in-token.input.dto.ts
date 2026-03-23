import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SignInTokenInput } from '@kylliangautier/authora-types';

export class SignInTokenInputDto implements SignInTokenInput {
  @ApiProperty({ description: 'Exchange token (one-time token)' })
  @IsString()
  @IsNotEmpty()
  exchangeToken: string;
}
