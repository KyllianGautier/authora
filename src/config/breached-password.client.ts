import { createHash } from 'crypto';

const PWNED_PASSWORDS_API = 'https://api.pwnedpasswords.com/range/';

/**
 * Builds the breached password API request for the given password.
 * Returns the URL to call and the value to match against the response lines.
 */
export function buildBreachedPasswordRequest(password: string): {
  url: string;
  valueToMatch: string;
} {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.substring(0, 5);
  const suffix = sha1.substring(5);

  return { url: `${PWNED_PASSWORDS_API}${prefix}`, valueToMatch: suffix };
}
