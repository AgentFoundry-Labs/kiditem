import { describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryFreshnessRepositoryAdapter } from './sellpia-inventory-freshness.repository.adapter';
import type { FailedSellpiaInventoryAttempt } from '../../../application/port/out/repository/sellpia-inventory-freshness.repository.port';
import type { SellpiaInventoryFreshnessState } from '../../../domain/policy/sellpia-inventory-freshness.policy';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000003';
const RUN_ID = '00000000-0000-4000-8000-000000000004';

describe('SellpiaInventoryFreshnessRepositoryAdapter source failure alerts', () => {
  it('uses the persisted failed SourceImportRun id for a replay-safe alert', async () => {
    const tx = makeTransaction();
    const alerts = {
      upsertSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new SellpiaInventoryFreshnessRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );
    const failure: FailedSellpiaInventoryAttempt = {
      organizationId: ORGANIZATION_ID,
      generation: 4n,
      claimToken: CLAIM_TOKEN,
      trigger: 'ttl_expired',
      errorCode: 'sellpia_background_timeout',
      errorMessage: 'Sellpia inventory collection expired before publication.',
      attemptedAt: new Date('2026-09-04T00:00:00.000Z'),
      createdBy: USER_ID,
    };

    await repository.withLockedState(
      {
        organizationId: ORGANIZATION_ID,
        createInitialState: () => ({ organizationId: ORGANIZATION_ID } as SellpiaInventoryFreshnessState),
      },
      (transaction) => transaction.upsertFailedAttempt(failure),
    );

    expect(alerts.upsertSourceFailure).toHaveBeenCalledWith(tx, {
      organizationId: ORGANIZATION_ID,
      dedupeKey: 'source:sellpia-inventory',
      sourceType: 'sellpia_inventory',
      attemptId: RUN_ID,
      severity: 'error',
      title: '셀피아 재고 수집 실패',
      message: 'sellpia_background_timeout: Sellpia inventory collection expired before publication.',
      href: '/stock-ops',
    });
  });

  it('propagates an alert failure so the owner transaction can roll back', async () => {
    const tx = makeTransaction();
    const alerts = {
      upsertSourceFailure: vi.fn().mockRejectedValue(new Error('alert write failed')),
    };
    const transaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));
    const repository = new SellpiaInventoryFreshnessRepositoryAdapter(
      { $transaction: transaction } as never,
      alerts as never,
    );

    await expect(repository.withLockedState(
      {
        organizationId: ORGANIZATION_ID,
        createInitialState: () => ({ organizationId: ORGANIZATION_ID } as SellpiaInventoryFreshnessState),
      },
      (locked) => locked.upsertFailedAttempt({
        organizationId: ORGANIZATION_ID,
        generation: 4n,
        claimToken: CLAIM_TOKEN,
        trigger: 'ttl_expired',
        errorCode: 'sellpia_background_timeout',
        errorMessage: 'expired',
        attemptedAt: new Date('2026-09-04T00:00:00.000Z'),
        createdBy: USER_ID,
      }),
    )).rejects.toThrow('alert write failed');
    expect(transaction).toHaveBeenCalledOnce();
  });
});

function makeTransaction() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    sellpiaInventoryState: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    sourceImportRun: {
      findFirstOrThrow: vi.fn().mockResolvedValue({ id: RUN_ID }),
    },
  };
}

function makePrisma(tx: ReturnType<typeof makeTransaction>) {
  return {
    $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
  };
}
