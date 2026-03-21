import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { UserEntity } from './user.entity';


export enum PasswordRevocationReason {
  ForgotAndReset  = 'FORGOT_AND_RESET',
  Expired = 'EXPIRED',
  AdminManual = 'ADMIN_MANUAL',
  Changed = 'CHANGE',
}

@Entity('password')
export class PasswordEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.passwords, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash: string;

  @Column({ name: 'revoked', type: 'boolean', default: false })
  revoked: boolean;

  @Column({ name: 'revocation_reason', type: 'enum', enum: PasswordRevocationReason, nullable: true })
  revocationReason: PasswordRevocationReason | null = null

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null = null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
