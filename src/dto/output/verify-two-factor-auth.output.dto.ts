import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFactorAuthOutputDto {
  @ApiProperty({
    description: 'List of recovery codes'
  })
  recoveryCodes: string[];
}
