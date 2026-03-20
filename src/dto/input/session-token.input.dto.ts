import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SessionTokenInputDto {
  @ApiProperty({ description: 'Exchange token (one-time token)' })
  @IsString()
  @IsNotEmpty()
  exchangeToken: string;
}
