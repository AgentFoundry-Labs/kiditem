import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

export interface RuntimeHandleCipher {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class AesGcmRuntimeHandleCipher implements RuntimeHandleCipher {
  private readonly key: Buffer;

  constructor(rawKey: string) {
    this.key = parseKey(rawKey);
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [version, iv, ciphertext, tag, extra] = value.split('.');
    if (
      version !== 'v1' ||
      !iv ||
      !ciphertext ||
      !tag ||
      extra !== undefined
    ) {
      throw new Error('RUNTIME_HANDLE_DECRYPT_INVALID');
    }
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('RUNTIME_HANDLE_DECRYPT_INVALID');
    }
  }
}

export function runtimeHandleCipherFromEnvironment(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
): RuntimeHandleCipher {
  const raw = env.AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY_REQUIRED');
  }
  return new AesGcmRuntimeHandleCipher(raw);
}

function parseKey(raw: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === KEY_BYTES) return base64;
  const utf8 = Buffer.from(raw, 'utf8');
  if (utf8.length === KEY_BYTES) return utf8;
  throw new Error('AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY_INVALID');
}
