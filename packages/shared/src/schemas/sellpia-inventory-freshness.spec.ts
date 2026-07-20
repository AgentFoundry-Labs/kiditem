import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '../errors/codes';
import * as freshnessContracts from './sellpia-inventory-freshness';
import {
  deriveSellpiaInventoryFreshness,
  SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES,
  SELLPIA_INVENTORY_FRESHNESS_STATUSES,
  SELLPIA_INVENTORY_REFRESH_REASONS,
  SellpiaInventoryCancelRequestSchema,
  SellpiaInventoryClaimRequestSchema,
  SellpiaInventoryClaimResponseSchema,
  SellpiaInventoryFailRequestSchema,
  SellpiaInventoryFreshnessViewSchema,
  SellpiaInventoryHeartbeatRequestSchema,
  SellpiaOrderTransmissionIntentAbortResponseSchema,
  SellpiaOrderTransmissionIntentFinalizeResponseSchema,
  SellpiaOrderTransmissionIntentPrepareRequestSchema,
  SellpiaOrderTransmissionIntentPrepareResponseSchema,
  SellpiaInventoryQualityReportSchema,
  SellpiaInventoryRefreshRequestSchema,
  SellpiaInventorySourceBindingRequestSchema,
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

  it('keeps an unresolved order transmission intent conservatively stale', () => {
    expect(deriveSellpiaInventoryFreshness({
      now: new Date('2026-07-15T00:01:00.000Z'),
      lastVerifiedAt: VERIFIED_AT,
      requestedGeneration: 4n,
      verifiedGeneration: 4n,
      failedGeneration: null,
      activeSyncLeaseExpiresAt: null,
      hasUnresolvedOrderTransmissionIntent: true,
    })).toBe(
      'refresh_required',
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
        startedAt: '2026-07-15T00:02:00.000Z',
        leaseExpiresAt: '2026-07-15T00:03:30.000Z',
        canControl: true,
      },
      lastAttempt: {
        attemptedAt: '2026-07-15T00:01:00.000Z',
        status: 'failed',
        trigger: 'manual_request',
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
  });
});

describe('Sellpia freshness mutation contracts', () => {
  it('defines strict audited privileged reconciliation contracts', () => {
    const contracts = freshnessContracts as typeof freshnessContracts & {
      SellpiaOrderTransmissionIntentReconcileRequestSchema?: {
        parse(input: unknown): unknown;
      };
      SellpiaOrderTransmissionIntentReconcileResponseSchema?: {
        parse(input: unknown): unknown;
      };
    };
    expect(contracts.SellpiaOrderTransmissionIntentReconcileRequestSchema).toBeDefined();
    expect(contracts.SellpiaOrderTransmissionIntentReconcileResponseSchema).toBeDefined();
    if (
      !contracts.SellpiaOrderTransmissionIntentReconcileRequestSchema
      || !contracts.SellpiaOrderTransmissionIntentReconcileResponseSchema
    ) return;

    expect(contracts.SellpiaOrderTransmissionIntentReconcileRequestSchema.parse({
      intentKey: 'orders-1',
      outcome: 'submitted',
      note: 'Sellpia 주문 내역에서 접수 확인',
    })).toBeTruthy();
    expect(() => contracts.SellpiaOrderTransmissionIntentReconcileRequestSchema!.parse({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: ' ',
    })).toThrow();
    expect(() => contracts.SellpiaOrderTransmissionIntentReconcileRequestSchema!.parse({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      note: '미접수 확인',
      reconciledBy: RUN_ID,
    })).toThrow();
    expect(contracts.SellpiaOrderTransmissionIntentReconcileResponseSchema.parse({
      intentKey: 'orders-1',
      outcome: 'submitted',
      status: 'finalized',
      finalizedGeneration: '5',
      reconciledBy: RUN_ID,
      reconciledAt: '2026-07-15T00:05:00.000Z',
      note: 'Sellpia 주문 내역에서 접수 확인',
      state: createFreshnessView(),
    })).toBeTruthy();
    expect(contracts.SellpiaOrderTransmissionIntentReconcileResponseSchema.parse({
      intentKey: 'orders-1',
      outcome: 'not_submitted',
      status: 'aborted',
      finalizedGeneration: null,
      reconciledBy: RUN_ID,
      reconciledAt: '2026-07-15T00:05:00.000Z',
      note: 'Sellpia 주문 내역에서 미접수 확인',
      state: createFreshnessView(),
    })).toBeTruthy();
  });

  it('defines strict idempotent order-transmission intent contracts', () => {
    expect(SellpiaOrderTransmissionIntentPrepareRequestSchema.parse({
      intentKey: '1721000000000-kidkids-browser',
    })).toEqual({ intentKey: '1721000000000-kidkids-browser' });
    expect(() => SellpiaOrderTransmissionIntentPrepareRequestSchema.parse({
      intentKey: 'orders-1',
      organizationId: RUN_ID,
    })).toThrow();
    expect(SellpiaOrderTransmissionIntentPrepareResponseSchema.parse({
      intentKey: 'orders-1',
      disposition: 'prepared',
      state: createFreshnessView(),
    })).toBeTruthy();
    expect(SellpiaOrderTransmissionIntentFinalizeResponseSchema.parse({
      intentKey: 'orders-1',
      status: 'finalized',
      finalizedGeneration: '5',
      state: {
        ...createFreshnessView(),
        status: 'refresh_required',
        requestedGeneration: '5',
      },
    })).toBeTruthy();
    expect(SellpiaOrderTransmissionIntentAbortResponseSchema.parse({
      intentKey: 'orders-1',
      status: 'aborted',
      state: createFreshnessView(),
    })).toBeTruthy();
  });

  it('accepts only public refresh reasons and no organization or actor identity', () => {
    for (const reason of [
      'order_transmission_requested',
      'manual_request',
      'retry',
    ] as const) {
      expect(SellpiaInventoryRefreshRequestSchema.parse({ reason })).toEqual({ reason });
    }
    expect(() => SellpiaInventoryRefreshRequestSchema.parse({
      reason: 'ttl_expired',
    })).toThrow();
    expect(() => SellpiaInventoryRefreshRequestSchema.parse({
      reason: 'manual_request',
      organizationId: RUN_ID,
    })).toThrow();
  });

  it('keeps claim, heartbeat, and cancel request bodies strictly empty', () => {
    for (const schema of [
      SellpiaInventoryClaimRequestSchema,
      SellpiaInventoryHeartbeatRequestSchema,
      SellpiaInventoryCancelRequestSchema,
    ]) {
      expect(schema.parse({})).toEqual({});
      expect(() => schema.parse({ userId: RUN_ID })).toThrow();
    }
  });

  it('accepts only the five typed Sellpia collection failures', () => {
    expect(SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES).toEqual([
      'sellpia_login_required',
      'sellpia_download_contract_drift',
      'sellpia_invalid_workbook',
      'sellpia_background_timeout',
      'sellpia_network_failed',
    ]);
    for (const errorCode of SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES) {
      expect(SellpiaInventoryFailRequestSchema.parse({
        errorCode,
        errorMessage: 'Collection failed',
      }).errorCode).toBe(errorCode);
    }
    expect(() => SellpiaInventoryFailRequestSchema.parse({
      errorCode: 'Collection failed',
      errorMessage: 'Collection failed',
    })).toThrow();
    expect(() => SellpiaInventoryFailRequestSchema.parse({
      errorCode: 'sellpia_network_failed',
      errorMessage: '   ',
    })).toThrow();
    expect(() => SellpiaInventoryFailRequestSchema.parse({
      errorCode: 'sellpia_network_failed',
      errorMessage: 'x'.repeat(301),
    })).toThrow();
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

  it('distinguishes an atomic claim winner from a joined observer', () => {
    const joined = {
      claimed: false,
      state: createFreshnessView(),
    } as const;
    expect(SellpiaInventoryClaimResponseSchema.parse(joined)).toEqual(joined);

    const winner = {
      claimed: true,
      claimToken: RUN_ID,
      activeGeneration: '5',
      leaseExpiresAt: '2026-07-15T00:03:30.000Z',
      state: createFreshnessView(),
    } as const;
    expect(SellpiaInventoryClaimResponseSchema.parse(winner)).toEqual(winner);
    expect(() => SellpiaInventoryClaimResponseSchema.parse({
      ...joined,
      claimToken: RUN_ID,
    })).toThrow();
    expect(() => SellpiaInventoryClaimResponseSchema.parse({
      ...winner,
      actorUserId: RUN_ID,
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
