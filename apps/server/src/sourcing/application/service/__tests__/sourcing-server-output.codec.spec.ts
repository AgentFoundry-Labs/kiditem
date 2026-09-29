import { describe, expect, it } from 'vitest';
import { OPERATION_CHUNK_MAX_BYTES } from '@kiditem/shared/operation';
import { decodeSourceOutput, encodeSourceOutput, sourceDocumentRef } from '../sourcing-server-output.codec';

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

  it('섀도 문서는 품목 하나가 원소 하나라, Google 100·Linkfox 50 품목(품목마다 이미지 URL 100개×2,000자)도 청크 상한 안에서 옛 문서 그대로 돌아온다', () => {
    const images = Array.from({ length: 100 }, (_, index) => `https://img.example/${String(index).padStart(4, '0')}/${'a'.repeat(1_975)}`);
    const item = (source: string, index: number) => ({ externalId: `${source}-${index}`, title: `품목 ${index}`, raw: { images } });
    const document = {
      version: 1,
      result: {
        status: 'complete',
        sources: [
          { source: 'google-trends-rss', items: Array.from({ length: 100 }, (_, index) => item('g', index)) },
          { source: 'linkfox-echotik-new-product-rank', items: Array.from({ length: 50 }, (_, index) => item('l', index)) },
        ],
      },
      meta: { generatedAt: capturedAt.toISOString() },
    };
    const skeleton = structuredClone(document);
    skeleton.result.sources.forEach((source) => { source.items = []; });
    const shadowOutput = {
      observations: [{ observationKey: 'o1', observedAt: capturedAt, rawPayload: sourceDocumentRef('shadow') }],
      typedRecords: [{ kind: 'market_shadow_snapshot', row: { businessDate, capturedAt, document: sourceDocumentRef('shadow') } }],
      discoveredCount: 1,
      rejectedCount: 0,
      qualityReport: {},
    } as never;
    const chunks = encodeSourceOutput(shadowOutput, {
      contentChecksum: 'c', windowStartAt: null, windowEndAt: capturedAt,
      documents: { shadow: { skeleton, lists: document.result.sources.map((source, index) => ({ path: ['result', 'sources', index, 'items'], items: source.items })) } },
    });
    for (const payload of chunks) expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(OPERATION_CHUNK_MAX_BYTES);
    const staged = chunks.map((payload, index) => ({ chunkKind: 'source_output', sequence: index + 1, itemCount: payload.length, payload }));
    const decoded = decodeSourceOutput(staged).output as unknown as {
      observations: Array<{ rawPayload: unknown }>; typedRecords: Array<{ row: { document: unknown } }>;
    };
    expect(decoded.observations[0].rawPayload).toEqual(document);
    expect(decoded.typedRecords[0].row.document).toEqual(document);
  });
});
