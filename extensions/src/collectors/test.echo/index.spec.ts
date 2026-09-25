import { describe, expect, it } from 'vitest';
import { collectorFor } from '../index';
import { testEchoCollector } from './index';

describe('collectors/test.echo — 계약 스모크용 더미 수집기', () => {
  it('kind 이름으로 등록되고 사이트를 쓰지 않는다', () => {
    expect(collectorFor('test.echo')).toBe(testEchoCollector);
    expect(testEchoCollector.site).toBeNull();
  });

  it('echo 청크 2장(각 3항목 {i, at})과 progress {done}을 낸다', async () => {
    const chunks = [];
    for await (const chunk of testEchoCollector.collect({ echo: true }, null, { signal: new AbortController().signal, tabId: null })) {
      chunks.push(chunk);
    }

    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length, chunk.progress])).toEqual([
      ['echo', 3, { done: 1 }],
      ['echo', 3, { done: 2 }],
    ]);
    expect(chunks.flatMap((chunk) => chunk.payload.map((item) => (item as { i: number }).i))).toEqual([1, 2, 3, 4, 5, 6]);
    for (const item of chunks.flatMap((chunk) => chunk.payload)) {
      expect(Number.isNaN(Date.parse((item as { at: string }).at))).toBe(false);
    }
  });

  it('abort되면 다음 청크를 내지 않는다', async () => {
    const controller = new AbortController();
    const chunks = [];
    for await (const chunk of testEchoCollector.collect({}, null, { signal: controller.signal, tabId: null })) {
      chunks.push(chunk);
      controller.abort();
    }
    expect(chunks).toHaveLength(1);
  });

  it('summarize는 result {echo: true}', () => {
    expect(testEchoCollector.summarize?.({ chunks: 2, items: 6 })).toEqual({ result: { echo: true } });
  });
});
