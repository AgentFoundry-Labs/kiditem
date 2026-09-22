export const CHANNEL_ACTIVITY_PORT = Symbol('CHANNEL_ACTIVITY_PORT');
export interface ChannelActivityPort {
  log(message: string): void;
  warn(message: string, details?: unknown): void;
}
