import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { IsDifferentFrom } from '../validator/is-different-from.decorator';

export class ChangePasswordInputDto {
  @ApiProperty({ description: 'Email address', example: 'user@domain.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Current clear text password',
    example: 'password123'
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New clear text password',
    example: 'newPassword456'
  })
  @IsString()
  @IsNotEmpty()
  @IsDifferentFrom('currentPassword', {
    message: 'New password must be different from current password'
  })
  newPassword: string;
}
