import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TenantSetting } from '../../config/settings';

export class UpdateTenantSettingInputDto {
  @ApiProperty({
    description: 'Setting key',
    enum: TenantSetting
  })
  @IsEnum(TenantSetting)
  key: TenantSetting;

  @ApiProperty({ description: 'Setting value (string, number, or boolean)' })
  @IsNotEmpty()
  value: string | number | boolean;
}
