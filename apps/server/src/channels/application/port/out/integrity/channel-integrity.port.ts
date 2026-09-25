export const CHANNEL_INTEGRITY_PORT = Symbol('CHANNEL_INTEGRITY_PORT');
export interface ChannelIntegrityPort {
  sha256(value: string): string;
  /** 파일 바이트의 SHA-256 hex. `prefix`(예: 계정 id)를 앞에 붙여 지문의 범위를 정한다. */
  sha256Bytes(prefix: string, bytes: Uint8Array): string;
}
