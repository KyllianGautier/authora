import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SessionTokenInput } from '@kylliangautier/authora-types';

export class SessionTokenInputDto implements SessionTokenInput {
  @ApiProperty({ description: 'Exchange token (one-time token)' })
  @IsString()
  @IsNotEmpty()
  exchangeToken: string;
}
