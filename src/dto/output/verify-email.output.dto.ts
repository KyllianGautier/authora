import { VerifyEmailOutput } from '@kylliangautier/authora-types';
import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../entity/user.entity';

export class VerifyEmailOutputDto implements VerifyEmailOutput {
  @ApiProperty({ description: 'Email address of the user' })
  email: string;

  @ApiProperty({
    description: 'User creation date',
    type: String,
    format: 'date-time'
  })
  createdAt: Date;

  static fromEntity(entity: UserEntity): VerifyEmailOutputDto {
    return Object.assign(new VerifyEmailOutputDto(), {
      email: entity.email,
      createdAt: entity.createdAt
    });
  }
}
