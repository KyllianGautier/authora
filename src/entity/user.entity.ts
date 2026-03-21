import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn
} from 'typeorm';
import { PasswordEntity } from './password.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { SignInAttemptEntity } from './sign-in-attempt.entity';
import { TrustedDeviceEntity } from './trusted-device.entity';



export enum LockReason {
  TooManyAttempts = 'TOO_MANY_ATTEMPTS',
  AdminManual = 'ADMIN_MANUAL',
  SuspiciousActivity = 'SUSPICIOUS_ACTIVITY'
}

const LOCK_REASON_SEVERITY: Record<LockReason, number> = {
  [LockReason.TooManyAttempts]: 1,
  [LockReason.AdminManual]: 2,
  [LockReason.SuspiciousActivity]: 3
};

export function isLockReasonEscalation(
  current: LockReason | null,
  next: LockReason
): boolean {
  if (current === null) {
    return true;
  }
  return LOCK_REASON_SEVERITY[next] > LOCK_REASON_SEVERITY[current];
}

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

  @OneToMany(() => SignInAttemptEntity, (signInAttempt) => signInAttempt.user, {
    orphanedRowAction: 'delete'
  })
  signInAttempts: SignInAttemptEntity[];

  @OneToMany(() => TrustedDeviceEntity, (trustedDevice) => trustedDevice.user, {
    orphanedRowAction: 'delete'
  })
  trustedDevices: TrustedDeviceEntity[];

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({
    name: 'lock_reason',
    type: 'enum',
    enum: LockReason,
    nullable: true
  })
  lockReason: LockReason | null;

  @Column({ name: 'failed_password_attempts', type: 'int', default: 0 })
  failedPasswordAttempts: number;

  @Column({ name: 'last_failed_password_at', type: 'timestamptz', nullable: true })
  lastFailedPasswordAt: Date | null;

  @Column({ name: 'failed_mfa_attempts', type: 'int', default: 0 })
  failedMfaAttempts: number;

  @Column({ name: 'last_failed_mfa_at', type: 'timestamptz', nullable: true })
  lastFailedMfaAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
