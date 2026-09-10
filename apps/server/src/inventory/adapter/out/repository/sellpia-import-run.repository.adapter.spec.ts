import { describe, expect, it, vi } from 'vitest';
import { SellpiaImportRunRepositoryAdapter } from './sellpia-import-run.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000004';

describe('SellpiaImportRunRepositoryAdapter source failure alerts', () => {
  it('upserts the focused alert after marking a parse attempt failed', async () => {
    const tx = makeTransaction();
    const alerts = {
      upsertSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new SellpiaImportRunRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );

    await repository.markRunFailed({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      attemptToken: CLAIM_TOKEN,
      userId: USER_ID,
      errorCode: 'sellpia_file_unreadable',
      errorMessage: ' workbook could not be read ',
      execution: {
        kind: 'manual',
        manualFreshExportConfirmed: true,
        claimToken: CLAIM_TOKEN,
        activeGeneration: '8',
        trigger: 'manual_request',
      },
    });

    expect(alerts.upsertSourceFailure).toHaveBeenCalledWith(tx, {
      organizationId: ORGANIZATION_ID,
      dedupeKey: 'source:sellpia-inventory',
      sourceType: 'sellpia_inventory',
      attemptId: RUN_ID,
      severity: 'error',
      title: '셀피아 재고 수집 실패',
      message: 'sellpia_file_unreadable: workbook could not be read',
      href: '/stock-ops',
    });
  });

  it('lets an alert failure reject the terminal owner transaction', async () => {
    const tx = makeTransaction();
    const alerts = {
      upsertSourceFailure: vi.fn().mockRejectedValue(new Error('alert write failed')),
    };
    const repository = new SellpiaImportRunRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );

    await expect(repository.markRunFailed({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      attemptToken: CLAIM_TOKEN,
      userId: USER_ID,
      errorCode: 'sellpia_file_unreadable',
      errorMessage: 'workbook could not be read',
      execution: {
        kind: 'manual',
        manualFreshExportConfirmed: true,
        claimToken: CLAIM_TOKEN,
        activeGeneration: '8',
        trigger: 'manual_request',
      },
    })).rejects.toThrow('alert write failed');
  });
});

function makeTransaction() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    sourceImportRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sellpiaInventoryState: {
      findUnique: vi.fn().mockResolvedValue({ activeSyncScope: 'inventory' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makePrisma(tx: ReturnType<typeof makeTransaction>) {
  return {
    $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
  };
}
