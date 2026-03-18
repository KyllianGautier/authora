import { SignInOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';

export class SignInOutputDto implements SignInOutput {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  type: 'Bearer';

  @ApiProperty({ description: 'Token expiration in seconds', example: 900 })
  expiresIn: number;
}
