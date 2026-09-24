export const CHANNEL_CREDENTIALS_PORT = Symbol('CHANNEL_CREDENTIALS_PORT');
export interface ChannelCredentialsPort {
  isEncrypted(value: unknown): boolean;
  encrypt(value: string): Record<string, unknown>;
  decrypt(value: unknown): string;
}
