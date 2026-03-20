import { VerifyMultiFactorAuthOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMultiFactorAuthOutputDto implements VerifyMultiFactorAuthOutput {
  @ApiProperty({
    description: 'List of recovery codes'
  })
  recoveryCodes: string[];
}
