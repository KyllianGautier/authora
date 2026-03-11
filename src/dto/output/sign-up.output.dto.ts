import { ApiProperty } from '@nestjs/swagger';
import { RegistrationEntity } from '../../entity/registration.entity';

export class SignUpOutputDto {
  @ApiProperty({ description: 'User unique identifier' })
  id: string;

  @ApiProperty({ description: 'Email address of the user' })
  email: string;

  @ApiProperty({
    description: 'User creation date',
    type: String,
    format: 'date-time'
  })
  createdAt: Date;

  static fromEntity(entity: RegistrationEntity): SignUpOutputDto {
    return Object.assign(new SignUpOutputDto(), {
      id: entity.id,
      email: entity.email,
      createdAt: entity.createdAt
    });
  }
}
