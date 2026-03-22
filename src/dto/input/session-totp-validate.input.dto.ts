import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class SessionTotpValidateInputDto {
  @ApiProperty({ description: 'Auth session id' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: '6-digit TOTP code', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;

  @ApiPropertyOptional({ description: 'Trust this device for future MFA bypass', default: false })
  @IsOptional()
  @IsBoolean()
  trustThisDevice?: boolean;
}
