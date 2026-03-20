import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSessionInputDto {
  @ApiProperty({ description: 'Tenant id', example: 'default' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
