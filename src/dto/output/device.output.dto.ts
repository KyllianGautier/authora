import { ApiProperty } from '@nestjs/swagger';
import { TrustedDeviceEntity } from '../../entity/trusted-device.entity';

export class DeviceOutputDto {
  @ApiProperty({ description: 'Device id' })
  id: string;

  @ApiProperty({ description: 'Device name' })
  name: string;

  @ApiProperty({ description: 'Browser name' })
  browser: string;

  @ApiProperty({ description: 'Operating system' })
  os: string;

  @ApiProperty({ description: 'Device type' })
  deviceType: string;

  @ApiProperty({ description: 'Whether the device is trusted' })
  trusted: boolean;

  @ApiProperty({ description: 'Last known IP address' })
  lastIp: string;

  @ApiProperty({ description: 'First seen date' })
  firstSeenAt: Date;

  @ApiProperty({ description: 'Last seen date' })
  lastSeenAt: Date;

  static fromEntity(entity: TrustedDeviceEntity): DeviceOutputDto {
    return {
      id: entity.id,
      name: entity.name,
      browser: entity.browser,
      os: entity.os,
      deviceType: entity.deviceType,
      trusted: entity.trusted,
      lastIp: entity.lastIp,
      firstSeenAt: entity.firstSeenAt,
      lastSeenAt: entity.lastSeenAt
    };
  }
}
