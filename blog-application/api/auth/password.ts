import bcrypt from 'bcryptjs';

// NOTE: bcrypt only uses the first 72 bytes of the input; the 200-char password
// limit is enforced by validation, longer-than-72-byte passwords are truncated by bcrypt.

/** Cost is read at call time so tests can set BCRYPT_ROUNDS after import. */
function rounds(): number {
  return Number(process.env['BCRYPT_ROUNDS']) || 12;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, rounds());
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | null = null;

/** Hash compared against for unknown users so login timing matches a real check. Lazy; cached per cost. */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing-parity');
  return dummyHash;
}
