import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

export function signTestJwt(payload: { sub: string; email: string }): string {
  const privateKey = readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8');

  return jwt.sign({ ...payload, jti: randomUUID() }, privateKey, {
    algorithm: 'RS256',
    issuer: 'authora',
    expiresIn: 3600
  });
}
