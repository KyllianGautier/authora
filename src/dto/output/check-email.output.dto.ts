import { ApiProperty } from '@nestjs/swagger';

export class CheckEmailOutputDto {
  @ApiProperty({
    description: 'Email check status'
  })
  message: string;
}
