import * as argon2 from 'argon2';

export async function hashCreate(value: string): Promise<string> {
  return argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 1_024,
    timeCost: 1,
    parallelism: 1
  });
}

export async function hashVerify(
  hash: string,
  value: string
): Promise<boolean> {
  return argon2.verify(hash, value);
}
