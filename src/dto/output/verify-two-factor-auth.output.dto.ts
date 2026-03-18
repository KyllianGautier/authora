import { VerifyTwoFactorAuthOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFactorAuthOutputDto implements VerifyTwoFactorAuthOutput {
  @ApiProperty({
    description: 'List of recovery codes'
  })
  recoveryCodes: string[];
}
