import { Injectable } from '@nestjs/common';
import {
  decryptCredential,
  encryptCredential,
  isEncryptedCredentialEnvelope,
} from './channel-credential-crypto';
import type { ChannelCredentialsPort } from '../../../application/port/out/credentials/channel-credentials.port';

@Injectable()
export class ChannelCredentialsAdapter implements ChannelCredentialsPort {
  isEncrypted(value: unknown): boolean {
    return isEncryptedCredentialEnvelope(value);
  }

  encrypt(value: string): Record<string, unknown> {
    return { ...encryptCredential(value) };
  }

  decrypt(value: unknown): string {
    return decryptCredential(value);
  }
}
