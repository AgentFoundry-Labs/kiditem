import { describe, expect, it } from 'vitest';
import { OperationKindSchema } from './operation.js';
import {
  ADVERTISING_KEYWORD_OPERATION_KINDS,
  WingTrackedProductsScopeSchema,
  advertisingKeywordIdentity,
} from './advertising-operations.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

describe('advertising keyword operation kinds (KID-362 K-a)', () => {
  it('every kind name satisfies the operation contract kind grammar', () => {
    for (const kind of ADVERTISING_KEYWORD_OPERATION_KINDS) expect(OperationKindSchema.parse(kind)).toBe(kind);
    expect(new Set(ADVERTISING_KEYWORD_OPERATION_KINDS).size).toBe(ADVERTISING_KEYWORD_OPERATION_KINDS.length);
  });

  it('tracked products scope canonicalises keywords, drops case-duplicates and keeps the 12-keyword limit', () => {
    const scope = WingTrackedProductsScopeSchema.parse({ channelAccountId: ACCOUNT, keywords: ['  아기  물티슈 ', 'Baby', 'baby'] });
    expect(scope.keywords).toEqual(['아기 물티슈', 'Baby']);
    expect(WingTrackedProductsScopeSchema.safeParse({ channelAccountId: ACCOUNT, keywords: Array.from({ length: 13 }, (_, i) => `k${i}`) }).success).toBe(false);
    expect(WingTrackedProductsScopeSchema.safeParse({ keywords: ['a'] }).success).toBe(false);
    expect(advertisingKeywordIdentity(' Baby  Wipes ')).toBe('baby wipes');
  });
});
