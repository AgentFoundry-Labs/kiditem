import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const KEY_ENV = 'CHANNEL_CREDENTIALS_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface EncryptedCredentialEnvelope {
  version: 1;
  algorithm: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  tag: string;
}

export class CoupangCredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoupangCredentialCryptoError';
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveKey(): Buffer {
  const raw = process.env[KEY_ENV]?.trim();
  if (!raw) {
    throw new CoupangCredentialCryptoError(
      `${KEY_ENV} is required to store Coupang channel credentials.`,
    );
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === KEY_BYTES) return base64;

  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === KEY_BYTES) return utf8;

  throw new CoupangCredentialCryptoError(
    `${KEY_ENV} must be 32 bytes as base64, hex, or raw UTF-8.`,
  );
}

export function encryptCredential(value: string): EncryptedCredentialEnvelope {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function isEncryptedCredentialEnvelope(
  value: unknown,
): value is EncryptedCredentialEnvelope {
  const record = toRecord(value);
  return Boolean(
    record &&
      record.version === 1 &&
      record.algorithm === ALGORITHM &&
      typeof record.iv === 'string' &&
      typeof record.ciphertext === 'string' &&
      typeof record.tag === 'string',
  );
}

export function decryptCredential(value: unknown): string {
  if (!isEncryptedCredentialEnvelope(value)) {
    throw new CoupangCredentialCryptoError('Invalid Coupang credential envelope.');
  }
  const key = resolveKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(value.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
