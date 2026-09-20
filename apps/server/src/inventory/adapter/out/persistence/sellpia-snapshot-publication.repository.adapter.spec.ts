import { describe, expect, it, vi } from 'vitest';
import { SellpiaSnapshotPublicationRepositoryAdapter } from './sellpia-snapshot-publication.repository.adapter';
import type { SellpiaInventoryState } from '@prisma/client';
import type { ParsedSellpiaInventoryRow } from '../../../application/usecase/sellpia-inventory-workbook.parser';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000004';
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000005';
const FILE_HASH = 'a'.repeat(64);

describe('SellpiaSnapshotPublicationRepositoryAdapter publication', () => {
  it('publishes a large snapshot change without a quality rejection', async () => {
    const tx = makePublicationSuccessTransaction();
    const alerts = {
      recordTerminalOutcome: vi.fn().mockResolvedValue(undefined),
      resolveSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new SellpiaSnapshotPublicationRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );

    await expect(repository.publishSnapshot({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      fileHash: FILE_HASH,
      execution: browserExecution(),
      rows: [inventoryRow('SP-001')],
      qualityFacts: [],
    })).resolves.toMatchObject({ outcome: 'published' });

    expect(alerts.recordTerminalOutcome).not.toHaveBeenCalled();
  });

  it('resolves the source failure alert during a successful same-hash verification', async () => {
    const tx = makeVerificationTransaction();
    const alerts = {
      recordTerminalOutcome: vi.fn().mockResolvedValue(undefined),
      resolveSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new SellpiaSnapshotPublicationRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );

    await expect(repository.verifySameHash({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runId: RUN_ID,
      fileHash: FILE_HASH,
      execution: browserExecution(),
    })).resolves.toMatchObject({ outcome: 'same_hash_verified' });

    expect(alerts.resolveSourceFailure).toHaveBeenCalledWith(tx, {
      organizationId: ORGANIZATION_ID,
      dedupeKey: 'source:sellpia-inventory',
      attemptId: RUN_ID,
    });
  });

  it('resolves the source failure alert during a successful snapshot publication', async () => {
    const tx = makePublicationSuccessTransaction();
    const alerts = {
      recordTerminalOutcome: vi.fn().mockResolvedValue(undefined),
      resolveSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new SellpiaSnapshotPublicationRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );

    await expect(repository.publishSnapshot({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      fileHash: FILE_HASH,
      execution: browserExecution(),
      rows: [inventoryRow('SP-001')],
      qualityFacts: [],
    })).resolves.toMatchObject({ outcome: 'published' });

    expect(alerts.resolveSourceFailure).toHaveBeenCalledWith(tx, {
      organizationId: ORGANIZATION_ID,
      dedupeKey: 'source:sellpia-inventory',
      attemptId: RUN_ID,
    });
  });

  it('does not write a quality alert for a publishable snapshot', async () => {
    const tx = makePublicationSuccessTransaction();
    const alerts = {
      recordTerminalOutcome: vi.fn().mockRejectedValue(new Error('alert write failed')),
      resolveSourceFailure: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new SellpiaSnapshotPublicationRepositoryAdapter(
      makePrisma(tx),
      alerts as never,
    );

    await expect(repository.publishSnapshot({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      fileHash: FILE_HASH,
      execution: browserExecution(),
      rows: [inventoryRow('SP-001')],
      qualityFacts: [],
    })).resolves.toMatchObject({ outcome: 'published' });

    expect(alerts.recordTerminalOutcome).not.toHaveBeenCalled();
  });
});

function browserExecution() {
  return {
    kind: 'browser' as const,
    claimToken: CLAIM_TOKEN,
    activeGeneration: '4',
    trigger: 'manual_request' as const,
    sourceOrigin: 'https://kiditem.sellpia.com' as const,
    sourceAccountKey: 'kiditem' as const,
  };
}

function inventoryRow(code: string): ParsedSellpiaInventoryRow {
  return {
    rowNumber: 2,
    sellpiaProductCode: code,
    name: 'Inventory item',
    optionName: null,
    barcode: '8801234567890',
    currentStock: 1,
    purchasePrice: 100,
    salePrice: 200,
    rawJson: {},
  };
}

function makeVerificationTransaction() {
  const state = {
    organizationId: ORGANIZATION_ID,
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
    activeSyncToken: CLAIM_TOKEN,
    activeSyncOwnerUserId: USER_ID,
    activeGeneration: 4n,
    requestedGeneration: 4n,
    verifiedGeneration: 3n,
    lastCompletedImportRunId: RUN_ID,
    requestedSyncScope: 'inventory',
    activeSyncScope: 'inventory',
    freshnessFence: '00000000-0000-4000-8000-000000000006',
    refreshReason: 'manual_request',
  } as unknown as SellpiaInventoryState;
  const run = makeCompletedRun();
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    sellpiaInventoryState: {
      findUnique: vi.fn().mockResolvedValue(state),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sourceImportRun: {
      findFirst: vi.fn().mockResolvedValue(run),
      findFirstOrThrow: vi.fn().mockResolvedValue(run),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makePublicationSuccessTransaction() {
  const state = {
    organizationId: ORGANIZATION_ID,
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
    activeSyncToken: CLAIM_TOKEN,
    activeSyncOwnerUserId: USER_ID,
    activeGeneration: 4n,
    requestedGeneration: 4n,
    verifiedGeneration: 3n,
    lastCompletedImportRunId: null,
    requestedSyncScope: 'inventory',
    activeSyncScope: 'inventory',
    freshnessFence: '00000000-0000-4000-8000-000000000006',
    refreshReason: 'manual_request',
  } as unknown as SellpiaInventoryState;
  const run = { ...makeCompletedRun(), status: 'running' };
  const completedRun = makeCompletedRun();
  return {
    $queryRaw: vi.fn(async (query: TemplateStringsArray | { strings: readonly string[] }) =>
      ('strings' in query ? query.strings : query).join('').includes('MAX(publication_sequence)')
        ? [{ publicationSequence: 1n }]
        : [],
    ),
    $executeRaw: vi.fn().mockResolvedValue(1),
    sellpiaInventoryState: {
      findUnique: vi.fn().mockResolvedValue(state),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sourceImportRun: {
      findFirst: vi.fn().mockResolvedValue(run),
      findFirstOrThrow: vi.fn().mockResolvedValue(completedRun),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sellpiaInventorySku: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    masterProductAbcFormulaState: {
      upsert: vi.fn().mockResolvedValue({ mappingGeneration: 1n }),
    },
  };
}

function makeCompletedRun() {
  const timestamp = new Date('2026-09-04T00:00:00.000Z');
  return {
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
    sourceType: 'sellpia_inventory',
    channelAccountId: null,
    fileName: 'inventory.xlsx',
    fileHash: FILE_HASH,
    status: 'completed',
    attemptToken: ATTEMPT_TOKEN,
    rowCount: 1,
    importedAt: timestamp,
    lastVerifiedAt: timestamp,
    verificationCount: 1,
    lastTrigger: 'manual_request',
    freshnessGeneration: 4n,
    manualFreshExportConfirmedAt: null,
    manualFreshExportConfirmedBy: null,
    qualityReport: null,
    errorCode: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makePrisma<T>(tx: T) {
  return {
    $transaction: vi.fn(async (operation: (client: T) => unknown) => operation(tx)),
  };
}
