import { ApiProperty } from '@nestjs/swagger';

export class SetupTwoFactorAuthOutputDto {
  @ApiProperty({
    description: 'QR code as a data URL for scanning with a 2FA app',
    example: 'data:image/png;base64,...'
  })
  qrcode: string;

  @ApiProperty({
    description: 'Manual code for manual entry in a 2FA app',
    example: 'JBSWY3DPEHPK3PXP'
  })
  manualCode: string;
}
