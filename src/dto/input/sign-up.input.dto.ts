import { SignUpInput } from '@kylliangautier/authora-types';
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

export class SignUpInputDto implements SignUpInput {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Clear text password', example: 'P@ssw0rd!' })
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
  password: string;
}
