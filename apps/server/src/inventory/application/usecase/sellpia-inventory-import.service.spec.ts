import { InventoryImportConflictError } from '../exception/inventory-operation.error';
import { createHash } from 'node:crypto';
import { InventoryImportInputError } from '../exception/inventory-operation.error';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryFileValidator } from './sellpia-inventory-file.validator';
import { SellpiaInventoryImportService } from './sellpia-inventory-import.service';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type {
  ImportSellpiaInventoryInput,
} from '../port/in/stock/sellpia-inventory-import.port';
import type { SellpiaImportRunRepositoryPort } from '../port/out/persistence/sellpia-import-run.repository.port';
import type { SellpiaSnapshotPublicationRepositoryPort } from '../port/out/persistence/sellpia-snapshot-publication.repository.port';

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000002';
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000003';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000010';
const USER_ID = '00000000-0000-4000-8000-000000000011';
const manualFile = Buffer.from(JSON.stringify({
  source: 'sellpia_product_search',
  version: 1,
  rowCount: 1,
  rows: [{
    productCode: 'SP',
    optionCode: '001',
    name: '상품',
    optionName: null,
    barcode: '8801234567890',
    currentStock: 4,
    purchasePrice: 100,
    salePrice: 200,
  }],
}));

const manualInput: ImportSellpiaInventoryInput = {
  organizationId: ORGANIZATION_ID,
  userId: USER_ID,
  file: {
    buffer: manualFile,
    fileName: 'sellpia-inventory-snapshot-v1.json',
    mimeType: 'application/json',
  },
  execution: {
    kind: 'manual',
    manualFreshExportConfirmed: true,
  },
};

const claimedManualExecution = {
  claimToken: CLAIM_TOKEN,
  activeGeneration: '7',
  trigger: 'manual_request' as const,
};

const completedRun = {
  id: RUN_ID,
  sourceType: 'sellpia_inventory' as const,
  channelAccountId: null,
  fileName: 'sellpia-inventory-snapshot-v1.json',
  fileHash: createHash('sha256').update(manualFile).digest('hex'),
  status: 'completed' as const,
  rowCount: 1,
  importedAt: '2026-07-15T00:00:00.000Z',
  lastVerifiedAt: '2026-07-15T00:00:00.000Z',
  verificationCount: 1,
  lastTrigger: 'legacy_manual_import' as const,
  freshnessGeneration: '1',
  manualFreshExportConfirmedAt: null,
  manualFreshExportConfirmedBy: null,
  qualityReport: { issues: [] },
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

describe('SellpiaInventoryImportService', () => {
  it('schedules one confirmation when the first post-order workbook has the same hash', async () => {
    const { service, repository, publication } = makeService();
    repository.claimFileRun.mockResolvedValue({
      kind: 'completed',
      runId: RUN_ID,
      claimedExecution: claimedManualExecution,
    });
    publication.verifySameHash.mockResolvedValue(response({
      outcome: 'same_hash_confirmation_scheduled',
      duplicate: true,
    }));

    const result = await service.importInventory(manualInput);

    expect(result.outcome).toBe('same_hash_confirmation_scheduled');
    expect(publication.publishSnapshot).not.toHaveBeenCalled();
  });

  it('verifies the bounded same-hash confirmation without scheduling a third run', async () => {
    const { service, repository, publication } = makeService();
    const confirmationInput: ImportSellpiaInventoryInput = manualInput;
    repository.claimFileRun.mockResolvedValue({
      kind: 'completed',
      runId: RUN_ID,
      claimedExecution: claimedManualExecution,
    });
    publication.verifySameHash.mockResolvedValue(response({
      outcome: 'same_hash_verified',
      duplicate: true,
    }));

    await expect(service.importInventory(confirmationInput)).resolves.toMatchObject({
      outcome: 'same_hash_verified',
    });
    expect(publication.verifySameHash).toHaveBeenCalledOnce();
    expect(publication.publishSnapshot).not.toHaveBeenCalled();
  });

  it('computes the hash before parsing, claims raw provenance, and publishes parsed rows', async () => {
    const { service, repository, publication } = makeService();
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      claimedExecution: claimedManualExecution,
    });
    publication.publishSnapshot.mockResolvedValue(response({ outcome: 'published' }));

    await service.importInventory(manualInput);

    const fileHash = createHash('sha256').update(manualFile).digest('hex');
    expect(repository.claimFileRun).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      fileName: 'sellpia-inventory-snapshot-v1.json',
      fileHash,
      execution: manualInput.execution,
    });
    expect(publication.publishSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      fileHash,
      execution: { ...manualInput.execution, ...claimedManualExecution },
      rows: [expect.objectContaining({
        sellpiaProductCode: 'SP-001',
        currentStock: 4,
      })],
    }));
  });

  it('maps private SKU publication counters to the temporary HTTP compatibility names', async () => {
    const { service, repository, publication } = makeService();
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      claimedExecution: claimedManualExecution,
    });
    publication.publishSnapshot.mockResolvedValue({
      run: completedRun,
      duplicate: false,
      outcome: 'published',
      changes: {
        createdSkuCount: 1,
        updatedSkuCount: 2,
        inactivatedSkuCount: 3,
      },
    } as never);

    await expect(service.importInventory(manualInput)).resolves.toMatchObject({
      changes: {
        createdMasterProductCount: 1,
        updatedMasterProductCount: 2,
        inactivatedMasterProductCount: 3,
      },
    });
  });

  it('uses the internal manual claim returned by the run repository', async () => {
    const { service, repository, publication } = makeService();
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      claimedExecution: { ...claimedManualExecution, activeGeneration: '8' },
    });
    publication.publishSnapshot.mockResolvedValue(response({ outcome: 'published' }));

    await service.importInventory(manualInput);

    expect(publication.publishSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      execution: {
        kind: 'manual',
        manualFreshExportConfirmed: true,
        claimToken: CLAIM_TOKEN,
        activeGeneration: '8',
        trigger: 'manual_request',
      },
    }));
  });

  it('records a sanitized terminal failure after claiming an invalid downloaded file', async () => {
    const { service, repository } = makeService();
    const html = Buffer.from('<html><body>secret login response</body></html>');
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      claimedExecution: claimedManualExecution,
    });

    await expect(service.importInventory({
      ...manualInput,
      file: { buffer: html, fileName: 'sellpia.xls', mimeType: 'text/html' },
    })).rejects.toBeInstanceOf(InventoryImportInputError);

    expect(repository.markRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      errorCode: 'sellpia_invalid_workbook',
      errorMessage: expect.not.stringContaining('secret login response'),
    }));
  });

  it('leaves a publication infrastructure failure non-terminal for fenced retry', async () => {
    const { service, repository, publication } = makeService();
    const publicationFailure = new Error('publication transaction timed out');
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      claimedExecution: claimedManualExecution,
    });
    publication.publishSnapshot.mockRejectedValue(publicationFailure);

    await expect(service.importInventory(manualInput)).rejects.toBe(publicationFailure);

    expect(repository.markRunFailed).not.toHaveBeenCalled();
  });

  it('rejects a coalesced running file without parsing or publishing it', async () => {
    const { service, repository, publication } = makeService();
    repository.claimFileRun.mockResolvedValue({ kind: 'running' });

    await expect(service.importInventory(manualInput))
      .rejects.toBeInstanceOf(InventoryImportConflictError);
    expect(publication.publishSnapshot).not.toHaveBeenCalled();
    expect(publication.verifySameHash).not.toHaveBeenCalled();
  });
});

function response(
  overrides: Partial<SellpiaInventoryImportResponse>,
): SellpiaInventoryImportResponse {
  return {
    run: completedRun,
    duplicate: false,
    outcome: 'published',
    changes: {
      createdMasterProductCount: 1,
      updatedMasterProductCount: 0,
      inactivatedMasterProductCount: 0,
    },
    ...overrides,
  };
}

function makeService() {
  const repository = {
    beginAttempt: vi.fn<SellpiaImportRunRepositoryPort['beginAttempt']>(),
    readAttempt: vi.fn<SellpiaImportRunRepositoryPort['readAttempt']>(),
    failAttempt: vi
      .fn<SellpiaImportRunRepositoryPort['failAttempt']>()
      .mockResolvedValue({} as never),
    cancelAttempt: vi.fn<SellpiaImportRunRepositoryPort['cancelAttempt']>(),
    claimFileRun: vi.fn<SellpiaImportRunRepositoryPort['claimFileRun']>(),
    markRunFailed: vi
      .fn<SellpiaImportRunRepositoryPort['markRunFailed']>()
      .mockResolvedValue(undefined),
  };
  const publication = {
    publishSnapshot: vi.fn<SellpiaSnapshotPublicationRepositoryPort['publishSnapshot']>(),
    verifySameHash: vi.fn<SellpiaSnapshotPublicationRepositoryPort['verifySameHash']>(),
  };
  return {
    service: new SellpiaInventoryImportService(
      repository,
      publication,
      new SellpiaInventoryFileValidator(),
    ),
    repository,
    publication,
  };
}
