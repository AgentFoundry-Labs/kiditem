import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ImportRocketSellpiaMatchingCsvInput } from '../../../application/port/in/rocket-sellpia-matching-csv-import.port';

const { upsertChannelCatalogIdentities } = vi.hoisted(() => ({
  upsertChannelCatalogIdentities: vi.fn(),
}));

vi.mock('./channel-catalog-identity-upsert', () => ({
  upsertChannelCatalogIdentities,
}));

import { RocketSellpiaMatchingCsvImportRepositoryAdapter } from './rocket-sellpia-matching-csv-import.repository.adapter';

const input: ImportRocketSellpiaMatchingCsvInput = {
  organizationId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000011',
  channelAccountId: '00000000-0000-4000-8000-000000000012',
  fileName: 'rocket443-sellpia-matching.csv',
  fileHash: 'b'.repeat(64),
  headers: ['skuId'],
  rows: [{
    rowNumber: 2,
    externalSkuId: '17616314',
    vendorItemId: null,
    productName: '돌고래게틀링비눗방울총',
    supplierStatus: null,
    channelBarcode: null,
    sellpiaProductName: null,
    sellpiaBarcode: null,
    matchMethod: null,
    confidence: null,
    sellpiaStoredMatch: false,
    kiditemSynchronized: false,
    matchStatus: null,
    evidence: null,
    rawJson: { skuId: '17616314' },
  }],
};

describe('RocketSellpiaMatchingCsvImportRepositoryAdapter', () => {
  it('accepts uploads only for the organization active Rocket account', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      channelAccount: { findFirst },
    }));
    const repository = new RocketSellpiaMatchingCsvImportRepositoryAdapter({
      $transaction: transaction,
    } as never);

    await expect(repository.importMatchingCsv(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: input.channelAccountId,
        organizationId: input.organizationId,
        channel: 'rocket',
        status: 'active',
      },
      select: { id: true },
    });
  });

  it('re-publishes an already uploaded file so corrected catalog fields take effect', async () => {
    const duplicate = {
      id: '00000000-0000-4000-8000-000000000013',
      organizationId: input.organizationId,
      sourceType: 'coupang_rocket_matching_csv',
      channelAccountId: input.channelAccountId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      status: 'completed',
      rowCount: input.rows.length,
      importedAt: new Date('2026-08-03T15:25:39.255Z'),
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date('2026-08-03T15:25:39.045Z'),
      updatedAt: new Date('2026-08-03T15:25:39.255Z'),
    };
    upsertChannelCatalogIdentities.mockResolvedValue({ changes: {} });
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $queryRaw: vi.fn().mockResolvedValue([]),
      channelAccount: { findFirst: vi.fn().mockResolvedValue({ id: input.channelAccountId }) },
      sourceImportRun: { findFirst: vi.fn().mockResolvedValue(duplicate) },
    }));
    const repository = new RocketSellpiaMatchingCsvImportRepositoryAdapter({
      $transaction: transaction,
    } as never);

    await expect(repository.importMatchingCsv(input)).resolves.toMatchObject({
      duplicate: true,
      changes: {
        updatedProductCount: 0,
        updatedSkuCount: 0,
      },
    });
    expect(upsertChannelCatalogIdentities).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lastImportRunId: duplicate.id,
      rawSource: 'coupang_rocket_matching_csv',
    }));
  });
});
