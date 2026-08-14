import { describe, expect, it } from 'vitest';
import {
  AesGcmRuntimeHandleCipher,
  runtimeHandleCipherFromEnvironment,
} from '../runtime-handle-cipher';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('durable runtime handle cipher', () => {
  it('authenticates opaque handle references without retaining plaintext', () => {
    const cipher = new AesGcmRuntimeHandleCipher(KEY);
    const encrypted = cipher.encrypt('reconnect-secret');

    expect(encrypted).not.toContain('reconnect-secret');
    expect(cipher.decrypt(encrypted)).toBe('reconnect-secret');
    expect(() => cipher.decrypt(`${encrypted}tampered`)).toThrow(
      'RUNTIME_HANDLE_DECRYPT_INVALID',
    );
  });

  it('requires one exact 32-byte environment key', () => {
    expect(() => runtimeHandleCipherFromEnvironment({})).toThrow(
      'AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY_REQUIRED',
    );
    expect(() => new AesGcmRuntimeHandleCipher('too-short')).toThrow(
      'AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY_INVALID',
    );
    expect(runtimeHandleCipherFromEnvironment({
      AGENT_RUNTIME_HANDLE_ENCRYPTION_KEY: KEY,
    }).decrypt(
      new AesGcmRuntimeHandleCipher(KEY).encrypt('same-key-secret'),
    )).toBe('same-key-secret');
  });
});
