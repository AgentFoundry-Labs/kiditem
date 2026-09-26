import { describe, expect, it } from 'vitest';
import { OperationKindSchema, OperationLockKeySchema } from './operation.js';
import {
  WING_ITEMWINNER_KIND,
  WingItemwinnerRowSchema,
  WingItemwinnerScopeSchema,
  wingDailyLockKey,
} from './advertising-operations.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

describe('Wing daily fact kinds (KID-362 K-b)', () => {
  it('kinds are Advertising contract kinds and the daily lock is one resource key per account', () => {
    expect(OperationKindSchema.parse(WING_ITEMWINNER_KIND)).toBe('advertising.wing_itemwinner');
    expect(OperationLockKeySchema.parse(wingDailyLockKey(ACCOUNT))).toBe(`resource:wing-daily:${ACCOUNT}`);
  });

  it('itemwinner scope names exactly one account', () => {
    expect(WingItemwinnerScopeSchema.parse({ channelAccountId: ACCOUNT })).toEqual({ channelAccountId: ACCOUNT });
    expect(WingItemwinnerScopeSchema.safeParse({}).success).toBe(false);
    expect(WingItemwinnerScopeSchema.safeParse({ channelAccountId: ACCOUNT, url: 'https://x' }).success).toBe(false);
  });

  it('itemwinner rows carry the provider option id and integer prices only', () => {
    const row = { vendorItemId: '101', productName: '상품', isWinner: true, myPrice: 1000, winnerPrice: 900, salesQty: 2, suppressed: false, providerWinnerStatus: true };
    expect(WingItemwinnerRowSchema.parse(row)).toEqual(row);
    expect(WingItemwinnerRowSchema.safeParse({ ...row, vendorItemId: 'A1' }).success).toBe(false);
    expect(WingItemwinnerRowSchema.safeParse({ ...row, myPrice: 10.5 }).success).toBe(false);
  });
});

