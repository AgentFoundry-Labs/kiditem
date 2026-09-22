export const CHANNEL_INTEGRITY_PORT = Symbol('CHANNEL_INTEGRITY_PORT');
export interface ChannelIntegrityPort { sha256(value: string): string; }
