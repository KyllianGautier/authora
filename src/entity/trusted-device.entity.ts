import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { UserEntity } from './user.entity';

@Entity('trusted_device')
export class TrustedDeviceEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.trustedDevices, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'fingerprint_hash' })
  fingerprintHash: string;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'last_ip' })
  lastIp: string;

  @Column({ name: 'user_agent' })
  userAgent: string;

  @Column({ name: 'browser', default: 'Unknown' })
  browser: string;

  @Column({ name: 'os', default: 'Unknown' })
  os: string;

  @Column({ name: 'device_type', default: 'desktop' })
  deviceType: string;

  @Column({ name: 'trusted', default: false })
  trusted: boolean = false;

  @Column({ name: 'trusted_until', type: 'timestamptz', nullable: true })
  trustedUntil: Date | null;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}