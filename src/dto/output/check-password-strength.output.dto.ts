import { CheckPasswordStrengthOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';

export class CheckPasswordStrengthOutputDto
  implements CheckPasswordStrengthOutput
{
  @ApiProperty({ description: 'Whether the password meets all active rules' })
  valid: boolean;

  @ApiProperty({
    description: 'List of error messages for rules that failed',
    type: [String]
  })
  errors: string[];
}
