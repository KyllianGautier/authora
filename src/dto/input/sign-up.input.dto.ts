import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from '../validator/is-strong-password.decorator';

export class SignUpInputDto {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Clear text password', example: 'P@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({ emailField: 'email' })
  password: string;
}
