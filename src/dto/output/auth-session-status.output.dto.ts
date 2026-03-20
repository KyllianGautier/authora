import { ApiProperty } from '@nestjs/swagger';
import { AuthSession } from '../../redis-model/auth-session.model';

export type AuthSessionNextStep = 'primaryAuth' | 'mfaSetup' | 'mfaAuth' | 'complete';

export class AuthSessionStatusOutputDto {
  @ApiProperty({ description: 'Auth session id' })
  sessionId: string;

  @ApiProperty({
    description: 'Next step in the authentication flow',
    enum: ['primaryAuth', 'mfaSetup', 'mfaAuth', 'complete']
  })
  nextStep: AuthSessionNextStep;

  static fromSession(session: AuthSession): AuthSessionStatusOutputDto {
    return {
      sessionId: session.id,
      nextStep: this._resolveNextStep(session)
    };
  }

  private static _resolveNextStep(session: AuthSession): AuthSessionNextStep {
    if (!session.primaryAuthVerified) {
      return 'primaryAuth';
    }

    if (session.mfaPolicy === 'REQUIRED') {
      if (!session.mfaSetup) {
        return 'mfaSetup';
      }
      if (!session.mfaVerified && !session.deviceTrusted) {
        return 'mfaAuth';
      }
    }

    if (session.mfaPolicy === 'OPTIONAL') {
      if (session.mfaSetup && !session.mfaVerified && !session.deviceTrusted) {
        return 'mfaAuth';
      }
    }

    return 'complete';
  }
}
