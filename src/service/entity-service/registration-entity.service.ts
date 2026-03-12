import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { RegistrationEntity } from '../../entity/registration.entity';

@Injectable()
export class RegistrationEntityService {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly _repository: Repository<RegistrationEntity>,
    private readonly _configService: ConfigService
  ) {}

  async create(data: {
    email: string;
    clearPassword: string;
    clearEmailVerificationToken: string;
  }): Promise<RegistrationEntity> {
    const [passwordHash, emailVerificationTokenHash] = await Promise.all([
      this._hash(data.clearPassword),
      this._hash(data.clearEmailVerificationToken)
    ]);
    return this._repository.save(
      this._repository.create({
        email: data.email,
        passwordHash,
        emailVerificationTokenHash,
        emailVerificationTokenExpiresAt:
          this._computeEmailVerificationTokenExpiresAt()
      })
    );
  }

  async findByEmail(email: string): Promise<RegistrationEntity | null> {
    return this._repository.findOneBy({ email });
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this._repository.existsBy({ email });
  }

  async updateEmailVerificationToken(
    registration: RegistrationEntity,
    clearEmailVerificationToken: string
  ): Promise<RegistrationEntity> {
    registration.emailVerificationTokenHash = await this._hash(
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
    const expirationSeconds = this._configService.get<number>(
      'EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS'
    );
    return DateTime.utc().plus({ seconds: expirationSeconds }).toJSDate();
  }

  private async _hash(value: string): Promise<string> {
    const saltRounds =
      this._configService.getOrThrow<number>('HASH_SALT_ROUNDS');
    return bcrypt.hash(value, saltRounds);
  }
}
