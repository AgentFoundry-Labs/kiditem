import { describe, expect, it } from 'vitest';
import { storedFailureAlert } from '../sourcing-browser-source-attempt.repository.adapter';

/**
 * An attempt carries the alert identity it was begun with.
 *
 * It used to be supplied again on complete and on fail — three call sites per
 * source, 27 of them across eleven services, with nothing checking the three
 * agreed. One did not: the live commerce owner built it from `plan.source` on
 * begin and from `sourceKey` on fail, and the second answered douyin for any key
 * it did not recognise.
 *
 * Merging them onto one key per source would have been the other way out, and it
 * is wrong: `completeAttempt` resolves by this key, so for the three sources that
 * key per collected target, one target succeeding would close another target's
 * unresolved failure.
 */
function attemptRow(failureAlert: unknown) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    qualityReport: failureAlert === undefined ? {} : { failureAlert },
  } as never;
}

describe('storedFailureAlert', () => {
  it('returns the identity the attempt was begun with', () => {
    const identity = {
      sourceType: '1688.live_commerce',
      dedupeKey: 'source:1688-live-commerce',
      title: '1688 라이브 수집 실패',
      href: '/sourcing-ai/market',
    };

    expect(storedFailureAlert(attemptRow(identity))).toEqual(identity);
  });

  it('keeps a per-target key, which is the whole reason it is stored', () => {
    // Three sources key their alert by the keyword or request being collected,
    // so no registry keyed on the source alone could rebuild this.
    const identity = {
      sourceType: 'coupang.keyword_suggestion',
      dedupeKey: 'source:coupang-keyword-suggestion:유아식탁의자',
      title: '쿠팡 키워드 제안 수집 실패',
      href: '/sourcing-ai/keywords',
    };

    expect(storedFailureAlert(attemptRow(identity)).dedupeKey)
      .toBe('source:coupang-keyword-suggestion:유아식탁의자');
  });

  it('survives the writes that replace the report it lives in', () => {
    // `completeAttempt` and the failed-output path both rewrite `qualityReport`
    // from the collector's own output, which does not carry the identity. They
    // spread it forward; without that, a completed attempt would come back with
    // no identity at all and the next read of it would throw.
    const identity = {
      sourceType: 'market.shadow_signals',
      dedupeKey: 'source:market-shadow-signals',
      title: '마켓 섀도우 수집 실패',
      href: '/sourcing-ai/market',
    };
    const afterComplete = {
      id: '11111111-1111-4111-8111-111111111111',
      qualityReport: {
        source: 'market.shadow_signals',
        planChecksum: 'abc',
        completeSnapshot: true,
        failureAlert: identity,
      },
    } as never;

    expect(storedFailureAlert(afterComplete)).toEqual(identity);
  });

  it('refuses an attempt begun without one rather than guessing', () => {
    expect(() => storedFailureAlert(attemptRow(undefined))).toThrow(/alert identity/);
    expect(() => storedFailureAlert(attemptRow({ title: '제목만' }))).toThrow(/alert identity/);
  });
});
