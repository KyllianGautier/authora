import { ChangePasswordInput } from '@kylliangautier/authora-types';
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

export class ChangePasswordInputDto implements ChangePasswordInput {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Current clear text password',
    example: 'P@ssw0rd!'
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New clear text password',
    example: 'N3wP@ss!'
  })
  @IsString()
  @IsNotEmpty()
  @IsDifferentFrom('currentPassword', {
    message: 'New password must be different from current password'
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
