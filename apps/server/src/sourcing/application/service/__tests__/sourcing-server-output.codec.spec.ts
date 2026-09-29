import { describe, expect, it } from 'vitest';
import { OPERATION_CHUNK_MAX_BYTES } from '@kiditem/shared/operation';
import { decodeSourceOutput, encodeSourceOutput } from '../sourcing-server-output.codec';

const capturedAt = new Date('2026-09-29T01:02:03.000Z');
const businessDate = new Date('2026-09-29T00:00:00.000Z');

function output(rows: number, text = 'x') {
  return {
    observations: [{ observationKey: 'o1', observedAt: capturedAt, rawPayload: { nested: { at: capturedAt } } }],
    typedRecords: Array.from({ length: rows }, (_, index) => ({
      kind: 'naver_keyword', row: { keyword: `${text}${index}`, businessDate, capturedAt, monthlyTotalSearchCount: null },
    })),
    discoveredCount: rows,
    rejectedCount: 0,
    qualityReport: { source: 'naver' },
  } as never;
}

describe('서버 구동 원장 출력의 청크 부호화', () => {
  it('청크로 나뉘어도 Date·null·중첩 값까지 그대로 돌아온다', () => {
    const head = { contentChecksum: 'c', windowStartAt: businessDate, windowEndAt: capturedAt, warnings: ['w'] };
    const chunks = encodeSourceOutput(output(3), head);
    const decoded = decodeSourceOutput(chunks.map((payload, index) => ({ chunkKind: 'source_output', sequence: index + 1, itemCount: payload.length, payload })));
    expect(decoded.output).toEqual(output(3));
    expect(decoded.head).toEqual(head);
    expect(decoded.output.typedRecords[0].row).toMatchObject({ capturedAt: expect.any(Date) });
  });

  it('청크 하나는 계약의 청크 상한을 넘지 않고, 순서가 섞여 와도 원래 순서로 모인다', () => {
    const big = output(4_000, 'y'.repeat(400));
    const chunks = encodeSourceOutput(big, { contentChecksum: 'c', windowStartAt: null, windowEndAt: null });
    expect(chunks.length).toBeGreaterThan(1);
    for (const payload of chunks) expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(OPERATION_CHUNK_MAX_BYTES);
    const staged = chunks.map((payload, index) => ({ chunkKind: 'source_output', sequence: index + 1, itemCount: payload.length, payload })).reverse();
    expect(decodeSourceOutput(staged).output).toEqual(big);
  });

  it('머리 원소가 없거나 모르는 청크 kind면 거절한다', () => {
    expect(() => decodeSourceOutput([])).toThrow();
    const [first] = encodeSourceOutput(output(1), { contentChecksum: 'c', windowStartAt: null, windowEndAt: null });
    expect(() => decodeSourceOutput([{ chunkKind: 'other', sequence: 1, itemCount: first.length, payload: first }])).toThrow();
  });
});
