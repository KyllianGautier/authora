import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { UserEntity } from './user.entity';


export enum AuthFailureReason {
  InvalidPasswordAuth = 'INVALID_CREDENTIALS',
  AccountLocked = 'ACCOUNT_LOCKED',
  TooManyAttempts = 'TOO_MANY_ATTEMPTS',
  PasswordExpired = 'PASSWORD_EXPIRED',
  InvalidMfaAuth = 'INVALID_MFA_CODE',
  TooManyMfaAttempts = 'TOO_MANY_MFA_ATTEMPTS'
}

@Entity('sign_in_attempt')
export class SignInAttemptEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string

  @ManyToOne(() => UserEntity, (user) => user.signInAttempts, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column()
  ip: string

  @Column()
  userAgent: string

  @Column()
  success: boolean

  @Column({ type: 'enum', enum: AuthFailureReason, nullable: true })
  failureReason: AuthFailureReason | null

  @CreateDateColumn()
  createdAt: Date
}