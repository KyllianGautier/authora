import { CheckEmailOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';

export class CheckEmailOutputDto implements CheckEmailOutput {
  @ApiProperty({
    description: 'Email check status'
  })
  message: string;
}
