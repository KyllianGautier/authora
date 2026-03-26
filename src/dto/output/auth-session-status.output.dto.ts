import { ApiProperty } from '@nestjs/swagger';
import type { AuthSessionStatusOutput } from '@kylliangautier/authora-types';
import { AuthSession, MfaPolicy } from '../../redis-model/auth-session.model';

export type AuthSessionNextStep = 'primaryAuth' | 'mfaSetup' | 'mfaAuth' | 'complete';

export class AuthSessionStatusOutputDto implements AuthSessionStatusOutput {
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

    if (session.mfaPolicy === MfaPolicy.Required) {
      if (!session.mfaSetup) {
        return 'mfaSetup';
      }
      if (!session.mfaVerified && !session.deviceTrusted) {
        return 'mfaAuth';
      }
    }

    if (session.mfaPolicy === MfaPolicy.Optional) {
      if (session.mfaSetup && !session.mfaVerified && !session.deviceTrusted) {
        return 'mfaAuth';
      }
    }

    return 'complete';
  }
}
