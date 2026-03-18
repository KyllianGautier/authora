import { DeleteAccountInput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class DeleteAccountInputDto implements DeleteAccountInput {
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
}
