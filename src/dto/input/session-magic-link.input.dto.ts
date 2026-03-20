import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsLocale, IsOptional } from 'class-validator';

export class SessionMagicLinkInputDto {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Locale for the magic link UI page', example: 'en' })
  @IsOptional()
  @IsLocale()
  locale?: string;
}
