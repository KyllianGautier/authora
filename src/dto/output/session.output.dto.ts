import { ApiProperty } from '@nestjs/swagger';
import { RefreshTokenEntity } from '../../entity/refresh-token.entity';

export class SessionOutputDto {
  @ApiProperty({ description: 'Session id' })
  id: string;

  @ApiProperty({ description: 'Session family id' })
  family: string;

  @ApiProperty({ description: 'Expiration date' })
  expiredAt: Date;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  static fromEntity(entity: RefreshTokenEntity): SessionOutputDto {
    return {
      id: entity.id,
      family: entity.family,
      expiredAt: entity.expiredAt,
      createdAt: entity.createdAt
    };
  }
}
