import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SignInMagicLinkValidateInput } from '@kylliangautier/authora-types';

export class SignInMagicLinkValidateInputDto implements SignInMagicLinkValidateInput {
  @ApiProperty({ description: 'Auth session id' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: 'Magic link token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
