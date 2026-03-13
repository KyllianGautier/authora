import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyTwoFactorAuthInputDto {
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
    description: '6-digits verification code',
    example: '123456'
  })
  @IsString()
  @Length(6, 6)
  code: string;
}
