import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import {
  HasDigit,
  HasLowercase,
  HasMinLength,
  HasSpecialChar,
  HasUppercase,
  NoCommonPassword,
  NoKeyboardSequence,
  NoRepeatedChars,
  NoSequentialChars,
  NoUserInfo
} from '../validator/password';

export class ForgotPasswordVerifyInputDto {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password reset token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New clear text password',
    example: 'N3wP@ss!'
  })
  @IsString()
  @IsNotEmpty()
  @HasMinLength()
  @HasDigit()
  @HasSpecialChar()
  @HasLowercase()
  @HasUppercase()
  @NoSequentialChars()
  @NoRepeatedChars()
  @NoKeyboardSequence()
  @NoUserInfo({ emailField: 'email' })
  @NoCommonPassword()
  newPassword: string;
}
