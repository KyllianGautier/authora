import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class SignInAuthorizeInputDto {
  @ApiProperty({ description: 'Redirect URI for the OAuth callback' })
  @IsUrl()
  @IsNotEmpty()
  redirectUri: string;

  @ApiProperty({ description: 'PKCE code challenge' })
  @IsString()
  @IsNotEmpty()
  codeChallenge: string;

  @ApiProperty({ description: 'PKCE code challenge method', example: 'S256' })
  @IsString()
  @IsNotEmpty()
  codeChallengeMethod: string;

  @ApiPropertyOptional({ description: 'Requested scopes' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional({ description: 'Opaque state value for CSRF protection' })
  @IsOptional()
  @IsString()
  state?: string;
}
