import { CheckPasswordStrengthInput } from '@kylliangautier/authora-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckPasswordStrengthInputDto
  implements CheckPasswordStrengthInput
{
  @ApiProperty({
    description: 'Password to check',
    example: 'P@ssw0rd!'
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description: 'Email address to check the user info rule against',
    example: 'user@domain.com'
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
