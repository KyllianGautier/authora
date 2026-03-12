import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn
} from 'typeorm';
import { OneTimeTokenEntity } from './one-time-token.entity';
import { PasswordEntity } from './password.entity';
import { RefreshTokenEntity } from './refresh-token.entity';

@Entity('user')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'email', type: 'varchar', unique: true })
  email: string;

  @OneToMany(() => PasswordEntity, (password) => password.user, {
    orphanedRowAction: 'delete'
  })
  passwords: PasswordEntity[];

  @OneToMany(() => RefreshTokenEntity, (refreshToken) => refreshToken.user, {
    orphanedRowAction: 'delete'
  })
  refreshTokens: RefreshTokenEntity[];

  @OneToMany(() => OneTimeTokenEntity, (oneTimeToken) => oneTimeToken.user, {
    eager: true,
    orphanedRowAction: 'delete'
  })
  oneTimeTokens: OneTimeTokenEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
