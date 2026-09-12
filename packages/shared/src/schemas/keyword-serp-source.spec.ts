import { describe, expect, it } from 'vitest';
import {
  KeywordSerpCaptureSchema,
  KeywordSerpSourceBeginSchema,
  KeywordSerpSourceAttemptSchema,
} from './keyword-serp-source';

describe('public keyword SERP source contract', () => {
  it.each([
    [undefined, 2],
    [0, 1],
    [9, 3],
    [2.8, 2],
    ['3', 3],
    ['bad', 2],
  ])('retains existing maxPages clamp for %s', (maxPages, expected) => {
    expect(
      KeywordSerpSourceBeginSchema.parse({ keyword: ' 문구 ', maxPages }),
    ).toEqual({ keyword: '문구', maxPages: expected });
  });
  it('accepts raw items for the existing defensive normalizer but requires explicit observation proof', () => {
    const capture = {
      keyword: '문구',
      capturedAt: '2026-09-06T00:00:00.000Z',
      pagesScanned: 1,
      items: [null, { rank: 1 }],
      pagination: {
        requestedMaxPages: 2,
        stoppedAtPage: 2,
        stopReason: 'empty_page',
      },
    };
    expect(KeywordSerpCaptureSchema.parse(capture)).toEqual(capture);
    const { pagination: _proof, ...withoutProof } = capture;
    expect(KeywordSerpCaptureSchema.safeParse(withoutProof).success).toBe(
      false,
    );
    expect(
      KeywordSerpCaptureSchema.safeParse({ ...capture, items: {} }).success,
    ).toBe(false);
    expect(
      KeywordSerpCaptureSchema.safeParse({ ...capture, operationRunId: 'old' })
        .success,
    ).toBe(false);
  });
  it('does not expose an attempt token through the public state shape', () => {
    const state = {
      attemptId: '11111111-1111-4111-8111-111111111111',
      keyword: '문구',
      generation: '1',
      state: 'RUNNING',
      plan: {
        sourceType: 'coupang_keyword_serp',
        parserVersion: 'keyword-serp-v1',
        keyword: '문구',
        maxPages: 2,
        explicitVendorItemIds: [],
        ownItems: [],
      },
      expiresAt: '2026-09-06T00:10:00.000Z',
      actualCutoffAt: null,
      itemCount: 0,
      errorCode: null,
      errorMessage: null,
    };
    expect(KeywordSerpSourceAttemptSchema.safeParse(state).success).toBe(true);
    expect(
      KeywordSerpSourceAttemptSchema.safeParse({
        ...state,
        attemptToken: state.attemptId,
      }).success,
    ).toBe(false);
  });
});
