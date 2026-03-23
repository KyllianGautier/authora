import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsLocale, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { SessionMagicLinkInput } from '@kylliangautier/authora-types';

export class SessionMagicLinkInputDto implements SessionMagicLinkInput {
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
