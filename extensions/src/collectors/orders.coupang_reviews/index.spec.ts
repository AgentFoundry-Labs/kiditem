import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { collectorFor } from '../index';
import { RuntimeError } from '../../core/errors';
import { COUPANG_REVIEWS_PAGE_LIMIT_REACHED, coupangReviewsCollector, type WingReviewsSite } from './index';

const ACCOUNT = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const WINDOWS = [
  { index: 0, label: '2026-09', start: '2026-09-01T00:00:00+09:00', end: '2026-09-25T23:59:59+09:00' },
  { index: 1, label: '2026-08', start: '2026-08-01T00:00:00+09:00', end: '2026-08-31T23:59:59+09:00' },
];

/** 가짜 Wing 상품평 사이트: 창 시작 날짜 → 쪽마다 리뷰 수. 요청을 기록한다. */
function fakeWing(pagesByStart: Record<string, number[]>) {
  const requests: Array<{ startTime: string; pageIndex: number }> = [];
  let next = 1;
  const site: WingReviewsSite = {
    async searchReviews({ start, pageIndex }) {
      const startTime = start.slice(0, 10);
      requests.push({ startTime, pageIndex });
      const pages = pagesByStart[startTime] ?? [];
      const count = pages[pageIndex] ?? 0;
      const items = Array.from({ length: count }, () => ({
        externalReviewId: String(next++), externalOptionId: null, externalProductId: null, itemName: null, rating: 5,
        title: null, content: null, reviewerName: null, reviewedAt: 1_756_700_000_000, imageCount: 0, videoCount: 0,
        isDeleted: false, isBlinded: false,
      }));
      return { items, totalPages: pages.length };
    },
  };
  return { site, requests };
}

async function collectAll(plan: Record<string, unknown>, site: WingReviewsSite, signal = new AbortController().signal) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of coupangReviewsCollector.collect(plan as never, site, { signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

describe('collectors/orders.coupang_reviews — Wing 상품평 월 창 수집', () => {
  it('kind 이름으로 등록되고 wing 사이트를 쓴다', () => {
    expect(collectorFor('orders.coupang_reviews')).toBe(coupangReviewsCollector);
    expect(coupangReviewsCollector.site).toBe('wing-reviews');
  });

  it('plan 창 순서대로 쪽을 넘기며 200개씩 reviews 청크(항목마다 windowIndex)를 내고, 창이 끝나면 review_windows 표식과 progress를 낸다', async () => {
    const wing = fakeWing({ '2026-09-01': [50, 50, 50, 50, 50], '2026-08-01': [] });
    const chunks = await collectAll({ channelAccountId: ACCOUNT, windows: WINDOWS, maxPagesPerWindow: 40 }, wing.site);

    expect(wing.requests).toEqual([
      ...[0, 1, 2, 3, 4].map((pageIndex) => ({ startTime: '2026-09-01', pageIndex })),
      { startTime: '2026-08-01', pageIndex: 0 },
    ]);
    expect(chunks.map((chunk) => [chunk.chunkKind, chunk.payload.length])).toEqual([
      ['reviews', 200],
      ['reviews', 50],
      ['review_windows', 1],
      ['review_windows', 1],
    ]);
    expect(chunks.slice(0, 2).flatMap((chunk) => chunk.payload).every((item) => (item as { windowIndex: number }).windowIndex === 0)).toBe(true);
    expect(chunks[2]!.payload).toEqual([{ index: 0, pages: 5, items: 250 }]);
    expect(chunks[3]!.payload).toEqual([{ index: 1, pages: 1, items: 0 }]);
    expect(chunks[0]!.progress).toEqual({ current: '2026-09', windows: [{ index: 0, pages: 4, items: 200, done: false }] });
    expect(chunks[3]!.progress).toEqual({
      current: null,
      windows: [{ index: 0, pages: 5, items: 250, done: true }, { index: 1, pages: 1, items: 0, done: true }],
    });
  });

  it('쪽 상한을 넘는 창은 표식 없이 RUNTIME_PAGE_LIMIT_REACHED로 멈춘다(잘린 창을 완결로 보고하지 않는다)', async () => {
    const wing = fakeWing({ '2026-09-01': [50, 50, 50] });
    const error = await collectAll({ channelAccountId: ACCOUNT, windows: WINDOWS.slice(0, 1), maxPagesPerWindow: 2 }, wing.site).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(RuntimeError);
    expect((error as RuntimeError).code).toBe(COUPANG_REVIEWS_PAGE_LIMIT_REACHED);
    expect(wing.requests).toHaveLength(2);
  });

  it('abort되면 다음 쪽을 부르지 않고 표식도 내지 않는다', async () => {
    const wing = fakeWing({ '2026-09-01': [50, 50, 50] });
    const controller = new AbortController();
    const original = wing.site.searchReviews.bind(wing.site);
    wing.site.searchReviews = async (input) => {
      const result = await original(input);
      controller.abort();
      return result;
    };
    const chunks = await collectAll({ channelAccountId: ACCOUNT, windows: WINDOWS.slice(0, 1), maxPagesPerWindow: 40 }, wing.site, controller.signal);
    expect(wing.requests).toHaveLength(1);
    expect(chunks.some((chunk) => chunk.chunkKind === 'review_windows')).toBe(false);
  });

  it('사이트 호출기가 없거나 plan이 계약과 다르면 시작하지 않는다', async () => {
    await expect(collectAll({ channelAccountId: ACCOUNT, windows: WINDOWS, maxPagesPerWindow: 40 }, null as never)).rejects.toBeInstanceOf(RuntimeError);
    await expect(collectAll({ windows: [] }, fakeWing({}).site)).rejects.toBeInstanceOf(RuntimeError);
  });
});
