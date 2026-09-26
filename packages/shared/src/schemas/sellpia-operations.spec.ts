import { describe, expect, it } from 'vitest';
import { OperationKindSchema, OperationLockKeySchema } from './operation.js';
import { SELLPIA_LOGIN_LOCK_KEY, SELLPIA_OPERATION_KINDS, SellpiaSalesScopeSchema } from './sellpia-operations.js';
import {
  MALL_ADMIN_LISTINGS_KIND,
  MALL_ADMIN_LISTING_OPERATION_MALLS,
  ROCKET_MATCHING_CSV_KIND,
  SABANGNET_LOGIN_LOCK_KEY,
  SABANGNET_MALL_LISTINGS_KIND,
  isMallAdminListingOperationMall,
} from './channels-operations.js';
import { MALL_ORDER_OPERATION_MALLS } from './orders-operations.js';

describe('wave3 kinds and lock keys (KID-361·363)', () => {
  it('kind names satisfy the contract grammar and owner prefixes', () => {
    for (const kind of [...SELLPIA_OPERATION_KINDS, SABANGNET_MALL_LISTINGS_KIND, MALL_ADMIN_LISTINGS_KIND, ROCKET_MATCHING_CSV_KIND]) {
      expect(OperationKindSchema.parse(kind)).toBe(kind);
    }
    expect(SELLPIA_OPERATION_KINDS.map((kind) => kind.split('.')[0])).toEqual(['products', 'analytics', 'analytics', 'channels']);
  });

  it('login lock keys are contract resource keys', () => {
    expect(OperationLockKeySchema.parse(SELLPIA_LOGIN_LOCK_KEY)).toBe('resource:sellpia:login');
    expect(OperationLockKeySchema.parse(SABANGNET_LOGIN_LOCK_KEY)).toBe('resource:sabangnet:login');
  });

  it('first-batch mall-admin malls equal the first-batch order malls', () => {
    expect([...MALL_ADMIN_LISTING_OPERATION_MALLS].sort()).toEqual([...MALL_ORDER_OPERATION_MALLS].sort());
    expect(isMallAdminListingOperationMall('gsshop')).toBe(false);
  });

  it('sales scope rejects a reversed range and accepts an empty one', () => {
    expect(SellpiaSalesScopeSchema.safeParse({ startDate: '2026-09-02', endDate: '2026-09-01' }).success).toBe(false);
    expect(SellpiaSalesScopeSchema.safeParse({}).success).toBe(true);
  });
});
