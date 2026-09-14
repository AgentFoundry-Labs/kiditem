import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '../errors/codes';
import {
  deriveSellpiaInventoryFreshness,
  SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES,
  SELLPIA_INVENTORY_FRESHNESS_STATUSES,
  SELLPIA_INVENTORY_REFRESH_REASONS,
  SellpiaInventoryFreshnessViewSchema,
  SellpiaInventoryQualityReportSchema,
  SellpiaInventorySourceBindingRequestSchema,
  SellpiaSyncScopeSchema,
} from './sellpia-inventory-freshness';

const VERIFIED_AT = new Date('2026-07-15T00:00:00.000Z');
const RUN_ID = '00000000-0000-4000-8000-000000000001';

const createFreshnessView = () => ({
  status: 'fresh' as const,
  sourceBinding: {
    origin: 'https://kiditem.sellpia.com' as const,
    accountKey: 'kiditem' as const,
    confirmed: true,
  },
  lastVerifiedAt: '2026-07-15T00:00:01.000Z',
  expiresAt: '2026-07-15T00:10:01.000Z',
  requestedGeneration: '4',
  verifiedGeneration: '4',
  refreshRequestedAt: null,
  refreshReason: null,
  requestedSyncScope: 'inventory' as const,
  syncNotBefore: null,
  activeSync: null,
  lastAttempt: null,
});

describe('Sellpia inventory freshness vocabulary', () => {
  it('keeps the exact four-state vocabulary and refresh reasons', () => {
    expect(SELLPIA_INVENTORY_FRESHNESS_STATUSES).toEqual([
      'fresh',
      'refresh_required',
      'syncing',
      'failed',
    ]);
    expect(SELLPIA_INVENTORY_REFRESH_REASONS).toEqual([
      'initial_snapshot',
      'ttl_expired',
      'order_transmission_requested',
      'same_hash_confirmation',
      'purchase_preflight',
      'manual_request',
      'retry',
      'legacy_manual_import',
    ]);
  });

  it('prioritizes a live lease over a failed requested generation', () => {
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:10:00.000Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 5n,
      verifiedGeneration: 4n,
      failedGeneration: 5n,
      activeSyncLeaseExpiresAt: new Date('2026-07-15T00:10:01.000Z'),
    })).toBe('syncing');
  });

  it('reports a failed latest generation before ordinary staleness', () => {
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:01:00.000Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 5n,
      verifiedGeneration: 4n,
      failedGeneration: 5n,
      activeSyncLeaseExpiresAt: null,
    })).toBe('failed');
  });

  it('requires refresh for a missing verification or pending generation', () => {
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:01:00.000Z'),
      lastVerifiedAt: null,
      requestedGeneration: 1n,
      verifiedGeneration: 0n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
    })).toBe('refresh_required');
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:01:00.000Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 5n,
      verifiedGeneration: 4n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
    })).toBe('refresh_required');
  });

  it('does not let an unresolved order transmission redefine stock freshness', () => {
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:01:00.000Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
      hasUnresolvedOrderTransmissionIntent: true,
    })).toBe(
      'fresh',
    );
  });

  it('is fresh before ten minutes and stale at exactly ten minutes', () => {
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:09:59.999Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
    })).toBe('fresh');
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:10:00.000Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
    })).toBe('refresh_required');
  });
});

describe('SellpiaInventoryFreshnessViewSchema', () => {
  it('serializes generations as decimal strings', () => {
    const parsed = SellpiaInventoryFreshnessViewSchema.parse(createFreshnessView());
    expect(parsed.verifiedGeneration).toBe('4');
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      verifiedGeneration: '04',
    })).toThrow();
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      verifiedGeneration: 4,
    })).toThrow();
  });

  it('represents an unconfirmed fixed source binding without inventing an account', () => {
    const parsed = SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      sourceBinding: {
        origin: 'https://kiditem.sellpia.com',
        accountKey: null,
        confirmed: false,
      },
    });
    expect(parsed.sourceBinding.accountKey).toBeNull();
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      sourceBinding: {
        origin: 'https://other.sellpia.com',
        accountKey: 'kiditem',
        confirmed: true,
      },
    })).toThrow();
  });

  it('rejects source bindings inconsistent with their confirmation discriminant', () => {
    const impossibleBindings = [
      {
        origin: 'https://kiditem.sellpia.com',
        accountKey: 'kiditem',
        confirmed: false,
      },
      {
        origin: 'https://kiditem.sellpia.com',
        accountKey: null,
        confirmed: true,
      },
    ];

    expect(impossibleBindings.map((sourceBinding) => (
      SellpiaInventoryFreshnessViewSchema.safeParse({
        ...createFreshnessView(),
        sourceBinding,
      }).success
    ))).toEqual([false, false]);
  });

  it('rejects unknown source-binding keys', () => {
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      sourceBinding: {
        ...createFreshnessView().sourceBinding,
        tenantSecret: 'secret',
      },
    })).toThrow();
  });

  it('accepts owner-safe active sync and last-attempt details', () => {
    const parsed = SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      status: 'syncing',
      activeSync: {
        runId: RUN_ID,
        generation: '5',
        scope: 'inventory',
        startedAt: '2026-07-15T00:02:00.000Z',
        leaseExpiresAt: '2026-07-15T00:03:30.000Z',
        canControl: true,
      },
      lastAttempt: {
        attemptedAt: '2026-07-15T00:01:00.000Z',
        trigger: 'manual_request',
        scope: 'inventory',
        errorCode: 'sellpia_network_failed',
        errorMessage: 'Network request failed',
      },
    });
    expect(parsed.activeSync?.runId).toBe(RUN_ID);
    expect(parsed.activeSync).not.toHaveProperty('ownerUserId');
  });

  it('rejects unknown keys throughout the view', () => {
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      activeRunId: RUN_ID,
    })).toThrow();
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      sourceBinding: {
        ...createFreshnessView().sourceBinding,
        password: 'secret',
      },
    })).toThrow();
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      status: 'syncing',
      activeSync: {
        runId: RUN_ID,
        generation: '5',
        startedAt: '2026-07-15T00:02:00.000Z',
        leaseExpiresAt: '2026-07-15T00:03:30.000Z',
        canControl: true,
        ownerUserId: RUN_ID,
      },
    })).toThrow();
    // The last attempt publishes its facts; the view carries no outcome word.
    expect(() => SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      lastAttempt: {
        attemptedAt: '2026-07-15T00:01:00.000Z',
        status: 'failed',
        trigger: 'manual_request',
        scope: 'inventory',
        errorCode: 'sellpia_network_failed',
        errorMessage: 'Network request failed',
      },
    })).toThrow();
  });
});

describe('Sellpia freshness mutation contracts', () => {
  it('requires a persisted full or inventory-only scope on visible attempts', () => {
    expect(SellpiaSyncScopeSchema.options).toEqual(['full', 'inventory']);
    expect(SellpiaInventoryFreshnessViewSchema.parse({
      ...createFreshnessView(),
      requestedSyncScope: 'full',
      activeSync: {
        runId: RUN_ID,
        generation: '5',
        scope: 'full',
        startedAt: '2026-07-15T00:02:00.000Z',
        leaseExpiresAt: '2026-07-15T00:03:30.000Z',
        canControl: true,
      },
      lastAttempt: {
        attemptedAt: '2026-07-15T00:01:00.000Z',
        trigger: 'manual_request',
        scope: 'inventory',
        errorCode: 'sellpia_network_failed',
        errorMessage: 'Network request failed',
      },
    }).activeSync?.scope).toBe('full');
  });

  it('keeps the persisted Sellpia collection failure codes bounded', () => {
    expect(SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES).toEqual([
      'sellpia_login_required',
      'sellpia_download_contract_drift',
      'sellpia_invalid_workbook',
      'sellpia_background_timeout',
      'sellpia_network_failed',
    ]);
  });

  it('binds only the fixed Sellpia origin and account', () => {
    const request = {
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      confirmed: true,
    } as const;
    expect(SellpiaInventorySourceBindingRequestSchema.parse(request)).toEqual(request);
    expect(() => SellpiaInventorySourceBindingRequestSchema.parse({
      ...request,
      confirmed: false,
    })).toThrow();
    expect(() => SellpiaInventorySourceBindingRequestSchema.parse({
      ...request,
      cookie: 'secret',
    })).toThrow();
  });

});

describe('SellpiaInventoryQualityReportSchema', () => {
  const issue = {
    code: 'missing_name',
    severity: 'warning' as const,
    count: 2,
    sampleRowNumbers: [2, 8],
    sampleProductCodes: ['P-100', 'P-200'],
  };

  it('accepts bounded quality issues', () => {
    expect(SellpiaInventoryQualityReportSchema.parse({ issues: [issue] })).toEqual({
      issues: [issue],
    });
  });

  it('allows at most twenty issues and ten samples per issue', () => {
    expect(() => SellpiaInventoryQualityReportSchema.parse({
      issues: Array.from({ length: 21 }, () => issue),
    })).toThrow();
    expect(() => SellpiaInventoryQualityReportSchema.parse({
      issues: [{
        ...issue,
        sampleRowNumbers: Array.from({ length: 11 }, (_, index) => index + 1),
      }],
    })).toThrow();
    expect(() => SellpiaInventoryQualityReportSchema.parse({
      issues: [{
        ...issue,
        sampleProductCodes: Array.from({ length: 11 }, (_, index) => `P-${index}`),
      }],
    })).toThrow();
  });
});

describe('Sellpia purchase errors', () => {
  it('keeps the exact machine-readable error strings', () => {
    expect(ErrorCodes.INVENTORY.SELLPIA_SYNC_REQUIRED).toBe('SELLPIA_SYNC_REQUIRED');
    expect(ErrorCodes.PURCHASE.ITEM_INACTIVE).toBe('PURCHASE_ITEM_INACTIVE');
    expect(ErrorCodes.PURCHASE.REFERENCE_INVALID).toBe('PURCHASE_REFERENCE_INVALID');
    expect(ErrorCodes.PURCHASE.SUBMISSION_RECONCILIATION_REQUIRED).toBe(
      'PURCHASE_SUBMISSION_RECONCILIATION_REQUIRED',
    );
    expect(ErrorCodes.PURCHASE.ROCKET_COLLECTION_INCOMPLETE).toBe(
      'ROCKET_COLLECTION_INCOMPLETE',
    );
  });
});
