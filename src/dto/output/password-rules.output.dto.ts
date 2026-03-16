import { PasswordRulesOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';

export class PasswordRulesOutputDto implements PasswordRulesOutput {
  @ApiProperty({ description: 'Minimum number of characters required' })
  minLength: number;

  @ApiProperty({ description: 'Whether at least one digit is required' })
  requireDigit: boolean;

  @ApiProperty({
    description: 'Whether at least one special character is required'
  })
  requireSpecialChar: boolean;

  @ApiProperty({
    description: 'Whether at least one lowercase letter is required'
  })
  requireLowercase: boolean;

  @ApiProperty({
    description: 'Whether at least one uppercase letter is required'
  })
  requireUppercase: boolean;

  @ApiProperty({
    description: 'Whether sequential characters are forbidden'
  })
  forbidSequentialChars: boolean;

  @ApiProperty({ description: 'Whether repeated characters are forbidden' })
  forbidRepeatedChars: boolean;

  @ApiProperty({ description: 'Whether keyboard sequences are forbidden' })
  forbidKeyboardSequence: boolean;

  @ApiProperty({
    description: 'Whether user info in the password is forbidden'
  })
  forbidUserInfo: boolean;

  @ApiProperty({
    description: 'Whether common/breached passwords are forbidden'
  })
  forbidCommonPassword: boolean;
}
