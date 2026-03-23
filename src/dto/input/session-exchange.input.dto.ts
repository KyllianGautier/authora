import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SessionExchangeInput } from '@kylliangautier/authora-types';

export class SessionExchangeInputDto implements SessionExchangeInput {
  @ApiProperty({ description: 'Auth session id' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
