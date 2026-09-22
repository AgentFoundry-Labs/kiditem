import { describe, expect, it, vi } from 'vitest';
import { ProductSourceCollectionRepositoryAdapter } from './product-source-collection.repository.adapter';
import type { PrismaService } from '../../../../prisma/prisma.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000004';

describe('ProductSourceCollectionRepositoryAdapter', () => {
  it('records terminal source failures and their alert in one transaction', async () => {
    const runningRun = {
      id: RUN_ID,
      organizationId: ORGANIZATION_ID,
      attemptToken: ATTEMPT_TOKEN,
      status: 'running',
      errorCode: null,
      errorMessage: null,
      expiresAt: new Date(Date.now() + 60_000),
      freshnessGeneration: 4n,
      plan: {
        sourceType: 'sellpia_inventory',
        parserVersion: 'sellpia-inventory-v1',
        scope: 'inventory',
        trigger: 'manual_request',
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
        generation: '4',
      },
      importedAt: null,
      fileName: null,
      fileHash: null,
      contentChecksum: null,
      rowCount: 0,
    };
    const failedRun = {
      ...runningRun,
      status: 'failed',
      errorCode: 'sellpia_invalid_workbook',
      errorMessage: 'invalid source artifact',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      sourceImportRun: {
        findFirst: vi.fn().mockResolvedValue(runningRun),
        update: vi.fn().mockResolvedValue(failedRun),
      },
      sellpiaInventoryState: {
        findUnique: vi.fn().mockResolvedValue({
          freshnessFence: '00000000-0000-4000-8000-000000000005',
          activeSyncScope: 'inventory',
          requestedSyncScope: 'inventory',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx)),
    } as unknown as PrismaService;
    const alerts = {
      recordTerminalOutcome: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new ProductSourceCollectionRepositoryAdapter(
      prisma,
      alerts as never,
    );

    await repository.failAttempt({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      attemptId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      errorCode: 'sellpia_invalid_workbook',
      errorMessage: 'invalid source artifact',
    });

    expect(alerts.recordTerminalOutcome).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        attemptId: RUN_ID,
        dedupeKey: 'source:sellpia-products',
      }),
    );
  });
});
