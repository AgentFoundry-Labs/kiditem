import type { RuntimeHandleCipher } from './runtime-handle-cipher';

const PREFIX = 'local.v1.';
const MAX_ENCODED_LENGTH = 16_384;

/**
 * Local CLI handles contain only KidItem execution coordinates and native
 * process/session identifiers. The provider login remains in the CLI-owned
 * service-account profile, so this codec deliberately has no key or credential.
 */
export const localRuntimeHandleCodec: RuntimeHandleCipher = {
  encrypt(value: string): string {
    const encoded = Buffer.from(value, 'utf8').toString('base64url');
    if (encoded.length > MAX_ENCODED_LENGTH) {
      throw new Error('CLI_RUNTIME_HANDLE_INVALID');
    }
    return `${PREFIX}${encoded}`;
  },

  decrypt(value: string): string {
    if (!value.startsWith(PREFIX) || value.length > PREFIX.length + MAX_ENCODED_LENGTH) {
      throw new Error('CLI_RUNTIME_HANDLE_INVALID');
    }
    try {
      const encoded = value.slice(PREFIX.length);
      const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
      if (!encoded || Buffer.from(decoded, 'utf8').toString('base64url') !== encoded) {
        throw new Error('CLI_RUNTIME_HANDLE_INVALID');
      }
      return decoded;
    } catch {
      throw new Error('CLI_RUNTIME_HANDLE_INVALID');
    }
  },
};
