import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { TenantSetting } from '../../config/settings';
import { TrustedDeviceEntity } from '../../entity/trusted-device.entity';
import { UserEntity } from '../../entity/user.entity';
import { HashService } from '../hash.service';
import { SettingsService } from '../settings.service';

@Injectable()
export class TrustedDeviceEntityService {
  constructor(
    @InjectRepository(TrustedDeviceEntity)
    private readonly _repository: Repository<TrustedDeviceEntity>,
    private readonly _hashService: HashService,
    private readonly _settingsService: SettingsService
  ) {}

  async findByFingerprint(
    user: UserEntity,
    fingerprint: string
  ): Promise<TrustedDeviceEntity | null> {
    const devices = await this._repository.find({
      where: { user: { id: user.id }, revoked: false }
    });

    for (const device of devices) {
      const match = await this._hashService.verify(
        device.fingerprintHash,
        fingerprint
      );

      if (match) {
        return device;
      }
    }

    return null;
  }

  isTrusted(device: TrustedDeviceEntity): boolean {
    return (
      device.trusted &&
      !device.revoked &&
      DateTime.fromJSDate(device.trustedUntil!) > DateTime.utc()
    );
  }

  async registerOrUpdate(
    user: UserEntity,
    fingerprint: string | undefined,
    ip: string,
    userAgent: string
  ): Promise<{ device: TrustedDeviceEntity; fingerprint: string }> {
    // Existing device — update lastSeen and return
    if (fingerprint !== undefined) {
      const existing = await this.findByFingerprint(user, fingerprint);

      if (existing !== null) {
        await this.updateLastSeen(existing, ip);
        return { device: existing, fingerprint };
      }
    }

    // New device — generate fingerprint, create, and return
    const newFingerprint = randomBytes(32).toString('hex');

    const device = await this.create({
      user,
      fingerprint: newFingerprint,
      name: 'Unknown',
      ip,
      userAgent
    });

    return { device, fingerprint: newFingerprint };
  }

  async create(data: {
    user: UserEntity;
    fingerprint: string;
    name: string;
    ip: string;
    userAgent: string;
    browser?: string;
    os?: string;
    deviceType?: string;
  }): Promise<TrustedDeviceEntity> {
    const now = DateTime.utc().toJSDate();
    const fingerprintHash = await this._hashService.hash(data.fingerprint);

    return this._repository.save(
      this._repository.create({
        user: data.user,
        fingerprintHash,
        name: data.name,
        lastIp: data.ip,
        userAgent: data.userAgent,
        browser: data.browser ?? 'Unknown',
        os: data.os ?? 'Unknown',
        deviceType: data.deviceType ?? 'desktop',
        firstSeenAt: now,
        lastSeenAt: now
      })
    );
  }

  async trust(device: TrustedDeviceEntity, tenantId: string): Promise<void> {
    const ttlSec = await this._settingsService.get(TenantSetting.TrustedDeviceTtlSec, tenantId);
    const trustedUntil = DateTime.utc()
      .plus({ seconds: ttlSec })
      .toJSDate();

    await this._repository.update(device.id, { trusted: true, trustedUntil });
  }

  async updateLastSeen(
    device: TrustedDeviceEntity,
    ip: string
  ): Promise<void> {
    await this._repository.update(device.id, {
      lastSeenAt: DateTime.utc().toJSDate(),
      lastIp: ip
    });
  }

  async revoke(device: TrustedDeviceEntity): Promise<void> {
    await this._repository.update(device.id, { revoked: true });
  }

  async revokeAllForUser(user: UserEntity): Promise<void> {
    await this._repository.update(
      { user: { id: user.id }, revoked: false },
      { revoked: true }
    );
  }

  async findAllForUser(user: UserEntity): Promise<TrustedDeviceEntity[]> {
    return this._repository.find({
      where: { user: { id: user.id }, revoked: false },
      order: { lastSeenAt: 'DESC' }
    });
  }
}
