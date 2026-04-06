import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SuperAdminLoginInputDto {
  @ApiProperty({ description: 'Super admin username' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: 'Super admin password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
