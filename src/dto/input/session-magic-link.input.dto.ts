import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsLocale, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SessionMagicLinkInputDto {
  @ApiProperty({ description: 'Auth session id' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Locale for the magic link UI page', example: 'en' })
  @IsOptional()
  @IsLocale()
  locale?: string;
}
