import { ApiProperty } from '@nestjs/swagger';

export class SignInOutputDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  type: 'Bearer';

  @ApiProperty({ description: 'Token expiration in seconds', example: 900 })
  expiresIn: number;
}
