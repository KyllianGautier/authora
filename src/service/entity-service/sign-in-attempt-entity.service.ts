import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entity/user.entity';
import { AuthFailureReason, SignInAttemptEntity } from '../../entity/sign-in-attempt.entity';

@Injectable()
export class SignInAttemptEntityService {
  constructor(
    @InjectRepository(SignInAttemptEntity)
    private readonly _repository: Repository<SignInAttemptEntity>
  ) {
  }

  create(user: UserEntity, ip: string, userAgent: string, success: boolean, failureReason?: AuthFailureReason): Promise<SignInAttemptEntity> {
    return this._repository.save(
      this._repository.create({
        user,
        ip,
        userAgent,
        success,
        failureReason: failureReason ?? null
      })
    );
  }
}