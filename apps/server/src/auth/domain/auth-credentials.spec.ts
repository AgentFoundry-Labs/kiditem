import { describe, expect, it } from 'vitest';
import {
  createAuthSessionToken,
  hashAuthPassword,
  hashAuthSessionToken,
  verifyAuthPassword,
} from './auth-credentials';

describe('Office local auth credentials', () => {
  it('stores a versioned scrypt password hash and verifies without exposing plaintext', async () => {
    const password = 'correct horse battery staple';
    const encoded = await hashAuthPassword(password);

    expect(encoded).toMatch(/^scrypt\$16384\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    expect(encoded).not.toContain(password);
    await expect(verifyAuthPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyAuthPassword('not the password', encoded)).resolves.toBe(false);
  });

  it('accepts short passwords and rejects only empty or oversized input', async () => {
    await expect(hashAuthPassword('1')).resolves.toMatch(/^scrypt\$/);
    await expect(hashAuthPassword('')).rejects.toThrow(RangeError);
    await expect(hashAuthPassword('x'.repeat(129))).rejects.toThrow(RangeError);
  });

  it('issues 32-byte opaque tokens and persists only a stable SHA-256 hash', () => {
    const token = createAuthSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashAuthSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAuthSessionToken(token)).toBe(hashAuthSessionToken(token));
  });
});
