import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SessionMagicLinkValidateInputDto {
  @ApiProperty({ description: 'Magic link token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
