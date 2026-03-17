import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { UserEntity } from './user.entity';

export enum OneTimeTokenType {
  TwoFactorAuthVerify = 'TWO_FACTOR_AUTH_VERIFY',
  TwoFactorAuthValidate = 'TWO_FACTOR_AUTH_VALIDATE',
  TwoFactorAuthDisabling = 'TWO_FACTOR_AUTH_DISABLING',
  AccountDeletion = 'ACCOUNT_DELETION',
  MagicLink = 'MAGIC_LINK'
}

@Entity('one_time_token')
export class OneTimeTokenEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.oneTimeTokens, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'type', type: 'enum', enum: OneTimeTokenType })
  type: OneTimeTokenType;

  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({ name: 'revoked', type: 'boolean', default: false })
  revoked: boolean;

  @Column({ name: 'expired_at', type: 'timestamptz' })
  expiredAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
