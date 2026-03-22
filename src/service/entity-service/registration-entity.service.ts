import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { TENANT_CONFIG } from '../../config/tenant-config';
import type { AuthoraTenantConfig } from '../../config/tenant-config';
import { RegistrationEntity } from '../../entity/registration.entity';
import { HashService } from '../hash.service';
import { TenantEntity } from '../../entity/tenant.entity';

@Injectable()
export class RegistrationEntityService {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly _repository: Repository<RegistrationEntity>,
    private readonly _hashService: HashService,
    @Inject(TENANT_CONFIG) private readonly _tenantConfig: AuthoraTenantConfig
  ) {}

  async create(data: {
    email: string;
    tenant: TenantEntity;
    clearPassword: string;
    clearEmailVerificationToken: string;
  }): Promise<RegistrationEntity> {
    const [passwordHash, emailVerificationTokenHash] = await Promise.all([
      this._hashService.hash(data.clearPassword),
      this._hashService.hash(data.clearEmailVerificationToken)
    ]);

    return this._repository.save(
      this._repository.create({
        email: data.email,
        tenant: data.tenant,
        passwordHash,
        emailVerificationTokenHash,
        emailVerificationTokenExpiresAt:
          this._computeEmailVerificationTokenExpiresAt()
      })
    );
  }

  async findByEmail(email: string): Promise<RegistrationEntity | null> {
    return this._repository.findOne({ where: { email }, relations: ['tenant'] });
  }

  async existsByEmail(email: string, tenant: TenantEntity): Promise<boolean> {
    return this._repository.existsBy({ email, tenant: { id: tenant.id } });
  }

  async updateEmailVerificationToken(
    registration: RegistrationEntity,
    clearEmailVerificationToken: string
  ): Promise<RegistrationEntity> {
    registration.emailVerificationTokenHash = await this._hashService.hash(
      clearEmailVerificationToken
    );
    registration.emailVerificationTokenExpiresAt =
      this._computeEmailVerificationTokenExpiresAt();
    return this._repository.save(registration);
  }

  async delete(registration: RegistrationEntity): Promise<void> {
    await this._repository.remove(registration);
  }

  private _computeEmailVerificationTokenExpiresAt(): Date {
    return DateTime.utc()
      .plus({ seconds: this._tenantConfig.emailVerificationTokenTtlSec })
      .toJSDate();
  }
}
