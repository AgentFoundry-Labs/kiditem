import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PASSWORD_ALGORITHM = 'scrypt';
const PASSWORD_COST = 16_384;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const MAX_PASSWORD_LENGTH = 128;
const SESSION_TOKEN_BYTES = 32;

const DUMMY_PASSWORD_HASH = [
  PASSWORD_ALGORITHM,
  String(PASSWORD_COST),
  Buffer.alloc(PASSWORD_SALT_BYTES).toString('base64url'),
  Buffer.alloc(PASSWORD_KEY_BYTES).toString('base64url'),
].join('$');

function derivePassword(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, { N: cost }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashAuthPassword(password: string): Promise<string> {
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`password must be non-empty and at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const digest = await derivePassword(password, salt, PASSWORD_COST);
  return [
    PASSWORD_ALGORITHM,
    String(PASSWORD_COST),
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$');
}

export async function verifyAuthPassword(
  password: string,
  encodedHash: string | null | undefined,
): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash) ?? parsePasswordHash(DUMMY_PASSWORD_HASH)!;
  const candidate = await derivePassword(password, parsed.salt, parsed.cost);
  const matches =
    parsed.digest.length === candidate.length && timingSafeEqual(parsed.digest, candidate);
  return encodedHash != null && parsed.source === encodedHash && matches;
}

export function createAuthSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashAuthSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isAuthSessionToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function parsePasswordHash(
  value: string | null | undefined,
): { source: string; salt: Buffer; digest: Buffer; cost: number } | null {
  if (!value) return null;
  const [algorithm, costValue, saltValue, digestValue, extra] = value.split('$');
  if (extra !== undefined || algorithm !== PASSWORD_ALGORITHM || costValue !== String(PASSWORD_COST)) {
    return null;
  }
  try {
    const salt = Buffer.from(saltValue, 'base64url');
    const digest = Buffer.from(digestValue, 'base64url');
    if (salt.length !== PASSWORD_SALT_BYTES || digest.length !== PASSWORD_KEY_BYTES) return null;
    return { source: value, salt, digest, cost: PASSWORD_COST };
  } catch {
    return null;
  }
}
