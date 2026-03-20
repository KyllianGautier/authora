import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { EMAIL_VERIFICATION_TOKEN_TTL_SEC } from '../../config/constants';
import { RegistrationEntity } from '../../entity/registration.entity';
import { HashService } from '../hash.service';

@Injectable()
export class RegistrationEntityService {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly _repository: Repository<RegistrationEntity>,
    private readonly _hashService: HashService
  ) {}

  async create(data: {
    email: string;
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
      .plus({ seconds: EMAIL_VERIFICATION_TOKEN_TTL_SEC })
      .toJSDate();
  }
}
