import { OPERATION_CHUNK_MAX_BYTES, OPERATION_CHUNKS_MAX } from '@kiditem/shared/operation';

export interface ChunkWriteInput {
  /** 같은 (chunkKind, sequence)에 이미 있는 청크의 checksum. 없으면 null. */
  existingChecksum: string | null;
  checksum: string;
  payload: readonly unknown[];
  /** 이 실행에 지금 보관된 청크 수. */
  storedChunks: number;
}

export type ChunkWriteVerdict =
  | { verdict: 'store'; itemCount: number }
  | { verdict: 'idempotent'; itemCount: number }
  /** 빈 payload: 청크 행을 만들지 않고 임대 연장·progress 갱신만 한다(heartbeat). */
  | { verdict: 'extend_only'; itemCount: 0 }
  | { verdict: 'conflict' }
  | { verdict: 'too_large' }
  | { verdict: 'too_many_chunks' };

const encoder = new TextEncoder();

export function chunkPayloadBytes(payload: readonly unknown[]): number {
  return encoder.encode(JSON.stringify(payload)).byteLength;
}

/**
 * 같은 칸에 같은 checksum이면 멱등 no-op, 다른 checksum이면 충돌(`chunk_conflict`).
 * 새 칸에 빈 payload면 보관하지 않고 임대만 연장한다(`extend_only` — 와이어의 "청크가 없는 kind는 payload: []로
 * progress만 보내 임대를 연장한다", KID-357). finalize는 이 쓰기를 보지 못하고 청크 상한에도 세지 않는다.
 * 그 밖의 새 칸은 payload 1MB(직렬화 UTF-8 바이트)·실행당 1,000개 상한 안에서만 보관한다.
 */
export function evaluateChunkWrite(input: ChunkWriteInput): ChunkWriteVerdict {
  if (input.existingChecksum !== null) {
    return input.existingChecksum === input.checksum
      ? { verdict: 'idempotent', itemCount: input.payload.length }
      : { verdict: 'conflict' };
  }
  if (input.payload.length === 0) return { verdict: 'extend_only', itemCount: 0 };
  if (chunkPayloadBytes(input.payload) > OPERATION_CHUNK_MAX_BYTES) return { verdict: 'too_large' };
  if (input.storedChunks >= OPERATION_CHUNKS_MAX) return { verdict: 'too_many_chunks' };
  return { verdict: 'store', itemCount: input.payload.length };
}
