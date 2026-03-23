import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SignInExchangeInput } from '@kylliangautier/authora-types';

export class SignInExchangeInputDto implements SignInExchangeInput {
  @ApiProperty({ description: 'Auth session id' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
