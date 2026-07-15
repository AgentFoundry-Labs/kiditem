import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type { ImportSellpiaInventoryInput } from '../port/in/stock/sellpia-inventory-import.port';
import type { ConfirmedChannelComponentReferencePort } from '../port/out/cross-domain/confirmed-channel-component-reference.port';
import type { SellpiaImportRunRepositoryPort } from '../port/out/repository/sellpia-import-run.repository.port';
import type { SellpiaSnapshotPublicationRepositoryPort } from '../port/out/repository/sellpia-snapshot-publication.repository.port';
import { SellpiaInventoryFileValidator } from './sellpia-inventory-file.validator';
import { SellpiaInventoryImportService } from './sellpia-inventory-import.service';

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000002';
const CLAIM_TOKEN = '00000000-0000-4000-8000-000000000003';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000010';
const USER_ID = '00000000-0000-4000-8000-000000000011';
const browserFile = Buffer.from(
  '상품코드,상품명,재고,바코드,매입가,판매가\nSP-001,상품,4,8801234567890,100,200',
);

const browserInput: ImportSellpiaInventoryInput = {
  organizationId: ORGANIZATION_ID,
  userId: USER_ID,
  file: {
    buffer: browserFile,
    fileName: 'sellpia.csv',
    mimeType: 'text/csv',
  },
  execution: {
    kind: 'browser',
    claimToken: CLAIM_TOKEN,
    activeGeneration: '7',
    trigger: 'order_transmission_requested',
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
  },
};

const completedRun = {
  id: RUN_ID,
  sourceType: 'sellpia_inventory' as const,
  channelAccountId: null,
  fileName: 'sellpia.csv',
  fileHash: createHash('sha256').update(browserFile).digest('hex'),
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
    repository.claimFileRun.mockResolvedValue({ kind: 'completed', runId: RUN_ID });
    publication.verifySameHash.mockResolvedValue(response({
      outcome: 'same_hash_confirmation_scheduled',
      duplicate: true,
    }));

    const result = await service.importInventory(browserInput);

    expect(result.outcome).toBe('same_hash_confirmation_scheduled');
    expect(publication.publishSnapshot).not.toHaveBeenCalled();
  });

  it('verifies the bounded same-hash confirmation without scheduling a third run', async () => {
    const { service, repository, publication } = makeService();
    const confirmationInput: ImportSellpiaInventoryInput = {
      ...browserInput,
      execution: { ...browserInput.execution, trigger: 'same_hash_confirmation' },
    };
    repository.claimFileRun.mockResolvedValue({ kind: 'completed', runId: RUN_ID });
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
    const { service, repository, publication, references } = makeService();
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
    });
    publication.publishSnapshot.mockResolvedValue(response({ outcome: 'published' }));

    await service.importInventory(browserInput);

    const fileHash = createHash('sha256').update(browserFile).digest('hex');
    expect(repository.claimFileRun).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      fileName: 'sellpia.csv',
      fileHash,
      execution: browserInput.execution,
    });
    expect(references.listReferencedSellpiaProductCodes)
      .toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(publication.publishSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      fileHash,
      execution: browserInput.execution,
      rows: [expect.objectContaining({
        sellpiaProductCode: 'SP-001',
        currentStock: 4,
      })],
    }));
  });

  it('uses the internal manual claim returned by the run repository', async () => {
    const { service, repository, publication } = makeService();
    const manualInput: ImportSellpiaInventoryInput = {
      ...browserInput,
      execution: { kind: 'manual', manualFreshExportConfirmed: true },
    };
    repository.claimFileRun.mockResolvedValue({
      kind: 'started',
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      claimedExecution: {
        claimToken: CLAIM_TOKEN,
        activeGeneration: '8',
        trigger: 'manual_request',
      },
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
    });

    await expect(service.importInventory({
      ...browserInput,
      file: { buffer: html, fileName: 'sellpia.xls', mimeType: 'text/html' },
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.markRunFailed).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      errorCode: 'sellpia_invalid_workbook',
      errorMessage: expect.not.stringContaining('secret login response'),
    }));
  });

  it('rejects a coalesced running file without parsing or publishing it', async () => {
    const { service, repository, publication } = makeService();
    repository.claimFileRun.mockResolvedValue({ kind: 'running' });

    await expect(service.importInventory(browserInput))
      .rejects.toBeInstanceOf(ConflictException);
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
    claimFileRun: vi.fn<SellpiaImportRunRepositoryPort['claimFileRun']>(),
    markRunFailed: vi
      .fn<SellpiaImportRunRepositoryPort['markRunFailed']>()
      .mockResolvedValue(undefined),
  };
  const publication = {
    publishSnapshot: vi.fn<SellpiaSnapshotPublicationRepositoryPort['publishSnapshot']>(),
    verifySameHash: vi.fn<SellpiaSnapshotPublicationRepositoryPort['verifySameHash']>(),
  };
  const references = {
    listReferencedSellpiaProductCodes: vi
      .fn<ConfirmedChannelComponentReferencePort['listReferencedSellpiaProductCodes']>()
      .mockResolvedValue([]),
  };
  return {
    service: new SellpiaInventoryImportService(
      repository,
      publication,
      references,
      new SellpiaInventoryFileValidator(),
    ),
    repository,
    publication,
    references,
  };
}
