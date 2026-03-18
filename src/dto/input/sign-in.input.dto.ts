import { SignInInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SignInInputDto implements SignInInput {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Current clear text password',
    example: 'P@ssw0rd!'
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'Extend refresh token duration',
    example: false
  })
  @IsBoolean()
  rememberMe: boolean;
}
