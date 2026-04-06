import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { AuthoraSetting } from '../../config/settings';

export class UpdateAuthoraSettingInputDto {
  @ApiProperty({
    description: 'Setting key',
    enum: AuthoraSetting
  })
  @IsEnum(AuthoraSetting)
  key: AuthoraSetting;

  @ApiProperty({ description: 'Setting value (string, number, or boolean)' })
  @IsNotEmpty()
  value: string | number | boolean;
}
