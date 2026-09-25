import { describe, expect, it } from 'vitest';
import { OPERATION_CHUNK_MAX_BYTES, OPERATION_CHUNKS_MAX } from '@kiditem/shared/operation';
import { evaluateChunkWrite } from '../operation-chunk';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('operation chunk write', () => {
  it('stores a new (chunkKind, sequence)', () => {
    expect(evaluateChunkWrite({ existingChecksum: null, checksum: A, payload: [{ id: 1 }], storedChunks: 0 })).toEqual({ verdict: 'store', itemCount: 1 });
  });

  it('treats a resend with the same checksum as an idempotent no-op', () => {
    expect(evaluateChunkWrite({ existingChecksum: A, checksum: A, payload: [1, 2], storedChunks: OPERATION_CHUNKS_MAX })).toEqual({ verdict: 'idempotent', itemCount: 2 });
  });

  it('refuses a different checksum on the same slot as a chunk conflict', () => {
    expect(evaluateChunkWrite({ existingChecksum: A, checksum: B, payload: [], storedChunks: 1 })).toEqual({ verdict: 'conflict' });
  });

  it('refuses the chunk past the per-operation count limit', () => {
    expect(evaluateChunkWrite({ existingChecksum: null, checksum: A, payload: [], storedChunks: OPERATION_CHUNKS_MAX - 1 }).verdict).toBe('store');
    expect(evaluateChunkWrite({ existingChecksum: null, checksum: A, payload: [], storedChunks: OPERATION_CHUNKS_MAX })).toEqual({ verdict: 'too_many_chunks' });
  });

  it('measures the payload in serialized UTF-8 bytes against the 1MB limit', () => {
    // JSON.stringify(['…']) adds 4 bytes of brackets and quotes; a Hangul syllable is 3 bytes.
    const fits = ['x'.repeat(OPERATION_CHUNK_MAX_BYTES - 4)];
    const over = ['x'.repeat(OPERATION_CHUNK_MAX_BYTES - 3)];
    expect(evaluateChunkWrite({ existingChecksum: null, checksum: A, payload: fits, storedChunks: 0 }).verdict).toBe('store');
    expect(evaluateChunkWrite({ existingChecksum: null, checksum: A, payload: over, storedChunks: 0 })).toEqual({ verdict: 'too_large' });
    const hangul = ['가'.repeat(Math.floor(OPERATION_CHUNK_MAX_BYTES / 3))];
    expect(evaluateChunkWrite({ existingChecksum: null, checksum: A, payload: hangul, storedChunks: 0 })).toEqual({ verdict: 'too_large' });
  });
});
