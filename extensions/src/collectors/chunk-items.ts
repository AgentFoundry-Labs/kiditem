import { OPERATION_CHUNK_MAX_BYTES } from '@kiditem/shared/operation';
import { RuntimeError } from '../core/errors';

const encoder = new TextEncoder();

/**
 * 원소를 청크 payload로 모은다: `maxItems`개 이하, JSON 직렬화 `maxBytes` 이하(실행 계약 1MiB). 원소 하나가 상한을
 * 넘으면 추측해 자르지 않고 멈춘다. 수집기가 원소를 넣을 때마다 꽉 찬 payload를 돌려준다.
 */
export class ChunkBuffer<T> {
  private items: T[] = [];
  private bytes = 2; // "[]"

  constructor(private readonly options: { maxItems: number; maxBytes?: number; label: string }) {}

  /** 넣고 나서 내보낼 payload(있으면). */
  push(item: T): T[] | null {
    const maxBytes = this.options.maxBytes ?? OPERATION_CHUNK_MAX_BYTES;
    const itemBytes = encoder.encode(JSON.stringify(item)).byteLength;
    if (itemBytes + 2 > maxBytes) {
      throw new RuntimeError('RUNTIME_CHUNK_TOO_LARGE', `${this.options.label} 하나가 청크 상한(${maxBytes}바이트)을 넘습니다.`, { bytes: itemBytes });
    }
    let flushed: T[] | null = null;
    const separator = this.items.length > 0 ? 1 : 0;
    if (this.items.length >= this.options.maxItems || this.bytes + separator + itemBytes > maxBytes) flushed = this.flush();
    this.bytes += (this.items.length > 0 ? 1 : 0) + itemBytes;
    this.items.push(item);
    if (this.items.length >= this.options.maxItems) return flushed ?? this.flush();
    return flushed;
  }

  /** 남은 원소(없으면 null). */
  flush(): T[] | null {
    if (this.items.length === 0) return null;
    const out = this.items;
    this.items = [];
    this.bytes = 2;
    return out;
  }
}
