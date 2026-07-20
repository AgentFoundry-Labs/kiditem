import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { CoupangWingCatalogImportResponse } from '@kiditem/shared/source-import';
import type { ImportCoupangWingCatalogInput } from '../../port/in/channel-catalog-import.port';
import type { ChannelCatalogImportRepositoryPort } from '../../port/out/repository/channel-catalog-import.repository.port';
import { ChannelCatalogImportService } from '../channel-catalog-import.service';

const runId = '00000000-0000-4000-8000-000000000001';
const attemptToken = '00000000-0000-4000-8000-000000000002';
const channelAccountId = '00000000-0000-4000-8000-000000000003';

const input: ImportCoupangWingCatalogInput = {
  organizationId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000011',
  channelAccountId,
  fileName: 'wing.xlsx',
  fileHash: 'a'.repeat(64),
  headers: ['등록상품ID', '옵션 ID'],
  rows: [{
    rowNumber: 5,
    externalProductId: 'P-001',
    registeredName: '등록 상품',
    displayName: '노출 상품',
    category: '완구',
    manufacturer: '제조사',
    brand: '브랜드',
    productStatus: '승인완료',
    externalSkuId: 'S-001',
    optionName: '블루',
    skuStatus: '판매중',
    modelNumber: 'MODEL-1',
    barcode: '001234567890',
    rawJson: { 등록상품ID: 'P-001', '옵션 ID': 'S-001' },
  }],
  skippedRows: [{
    rowNumber: 6,
    reason: 'missing_sku_id',
    externalProductId: 'P-002',
    externalSkuId: null,
  }],
};

const response: CoupangWingCatalogImportResponse = {
  run: {
    id: runId,
    sourceType: 'coupang_wing_catalog',
    channelAccountId,
    fileName: 'wing.xlsx',
    fileHash: 'a'.repeat(64),
    status: 'completed',
    rowCount: 1,
    importedAt: '2026-07-11T00:00:00.000Z',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  },
  duplicate: false,
  changes: {
    createdProductCount: 1,
    updatedProductCount: 0,
    createdSkuCount: 1,
    updatedSkuCount: 0,
    skippedRowCount: 1,
  },
};

describe('ChannelCatalogImportService', () => {
  it('rejects an all-skipped full publication before claiming or deactivating account rows', async () => {
    const repository = makeRepository();
    const service = new ChannelCatalogImportService(repository);

    await expect(service.importCoupangWing({
      ...input,
      rows: [],
      skippedRows: [
        {
          rowNumber: 5,
          reason: 'missing_product_id',
          externalProductId: null,
          externalSkuId: 'S-RECOVERABLE',
        },
        {
          rowNumber: 6,
          reason: 'missing_sku_id',
          externalProductId: 'P-RECOVERABLE',
          externalSkuId: null,
        },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.claimCoupangWingImport).not.toHaveBeenCalled();
    expect(repository.upsertCoupangWingCatalog).not.toHaveBeenCalled();
  });

  it('returns a completed account-scoped duplicate without writing catalog rows', async () => {
    const repository = makeRepository();
    repository.claimCoupangWingImport.mockResolvedValue({
      kind: 'duplicate',
      response: { ...response, duplicate: true, changes: zeroChanges() },
    });
    const service = new ChannelCatalogImportService(repository);

    const result = await service.importCoupangWing(input);

    expect(result.duplicate).toBe(true);
    expect(repository.upsertCoupangWingCatalog).not.toHaveBeenCalled();
  });

  it('rejects a fresh running import with HTTP 409', async () => {
    const repository = makeRepository();
    repository.claimCoupangWingImport.mockResolvedValue({ kind: 'running' });
    const service = new ChannelCatalogImportService(repository);

    await expect(service.importCoupangWing(input)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.upsertCoupangWingCatalog).not.toHaveBeenCalled();
  });

  it('claims with account/file provenance and writes a started or reclaimed attempt once', async () => {
    const repository = makeRepository();
    repository.claimCoupangWingImport.mockResolvedValue({
      kind: 'started',
      runId,
      attemptToken,
    });
    repository.upsertCoupangWingCatalog.mockResolvedValue(response);
    const service = new ChannelCatalogImportService(repository);

    const result = await service.importCoupangWing(input);

    expect(repository.claimCoupangWingImport).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      rowCount: 1,
    });
    expect(repository.upsertCoupangWingCatalog).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      channelAccountId,
      runId,
      attemptToken,
      rows: input.rows,
      skippedRows: input.skippedRows,
    });
    expect(result).toBe(response);
  });

  it.each([
    new NotFoundException('account not found'),
    new BadRequestException('not a Wing account'),
  ])('propagates account validation errors before a run starts', async (accountError) => {
    const repository = makeRepository();
    repository.claimCoupangWingImport.mockRejectedValue(accountError);
    const service = new ChannelCatalogImportService(repository);

    await expect(service.importCoupangWing(input)).rejects.toBe(accountError);
    expect(repository.upsertCoupangWingCatalog).not.toHaveBeenCalled();
    expect(repository.markImportFailed).not.toHaveBeenCalled();
  });

  it('fences failure marking by organization, account, run, and attempt token', async () => {
    const writeError = new Error('catalog upsert failed');
    const repository = makeRepository();
    repository.claimCoupangWingImport.mockResolvedValue({
      kind: 'started',
      runId,
      attemptToken,
    });
    repository.upsertCoupangWingCatalog.mockRejectedValue(writeError);
    repository.markImportFailed.mockRejectedValue(new Error('worker lost fence'));
    const service = new ChannelCatalogImportService(repository);

    await expect(service.importCoupangWing(input)).rejects.toBe(writeError);
    expect(repository.markImportFailed).toHaveBeenCalledWith(
      input.organizationId,
      channelAccountId,
      runId,
      attemptToken,
    );
  });

  it('injects only the channel catalog import repository', () => {
    expect(ChannelCatalogImportService.length).toBe(1);
    expect(() => new ChannelCatalogImportService(makeRepository())).not.toThrow();
  });
});

function zeroChanges(): CoupangWingCatalogImportResponse['changes'] {
  return {
    createdProductCount: 0,
    updatedProductCount: 0,
    createdSkuCount: 0,
    updatedSkuCount: 0,
    skippedRowCount: 0,
  };
}

function makeRepository() {
  return {
    claimCoupangWingImport:
      vi.fn<ChannelCatalogImportRepositoryPort['claimCoupangWingImport']>(),
    upsertCoupangWingCatalog:
      vi.fn<ChannelCatalogImportRepositoryPort['upsertCoupangWingCatalog']>(),
    markImportFailed:
      vi.fn<ChannelCatalogImportRepositoryPort['markImportFailed']>()
        .mockResolvedValue(undefined),
  };
}
