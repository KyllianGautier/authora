import { ForgotPasswordVerifyInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { IsDifferentFrom } from '../validator/is-different-from.decorator';
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

export class ForgotPasswordVerifyInputDto implements ForgotPasswordVerifyInput {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'One-time forgot password token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ description: 'New password' })
  @IsString()
  @IsNotEmpty()
  @IsDifferentFrom('token', {
    message: 'New password must be different from the token'
  })
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
