import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsLocale, IsOptional, IsUrl } from 'class-validator';

export class MagicLinkInputDto {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description:
      'URL to redirect the user to after magic link validation',
    example: 'https://myapp.com/dashboard'
  })
  @IsOptional()
  @IsUrl()
  redirectTo?: string;

  @ApiPropertyOptional({
    description: 'Locale for the magic link UI page',
    example: 'en'
  })
  @IsOptional()
  @IsLocale()
  locale?: string;
}
