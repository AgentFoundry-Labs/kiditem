import type { PersistRocketSellpiaMatchingCsvInput } from '../../port/out/repository/rocket-sellpia-matching-csv-import.repository.port';
import { describe, expect, it, vi } from 'vitest';
import { ChannelInputError } from '../../../domain/exception/channel-business-error';
import type { CoupangRocketMatchingCsvImportResponse } from '@kiditem/shared/source-import';
import type { ImportRocketSellpiaMatchingCsvInput } from '../../port/in/rocket-sellpia-matching-csv-import.port';
import type { RocketSellpiaMatchingCsvImportRepositoryPort } from '../../port/out/repository/rocket-sellpia-matching-csv-import.repository.port';
import { RocketSellpiaMatchingCsvImportService } from './rocket-sellpia-matching-csv-import.service';

const input: PersistRocketSellpiaMatchingCsvInput = {
  organizationId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000011',
  channelAccountId: '00000000-0000-4000-8000-000000000012',
  fileName: 'rocket443-sellpia-matching.csv',
  fileHash: 'b'.repeat(64),
  headers: ['skuId'],
  rows: [{
    rowNumber: 2,
    externalSkuId: '17616314',
    vendorItemId: '78399258325',
    productName: '돌고래게틀링비눗방울총',
    supplierStatus: '활성',
    channelBarcode: '8806384883947',
    sellpiaProductName: '6000돌고래게틀링비눗방울총',
    sellpiaBarcode: '8806384885163',
    matchMethod: '이름매칭',
    confidence: 'high',
    sellpiaStoredMatch: false,
    kiditemSynchronized: false,
    matchStatus: '이름매칭(高)',
    evidence: '제품명 일치',
    rawJson: { skuId: '17616314' },
  }],
};

const response: CoupangRocketMatchingCsvImportResponse = {
  run: {
    id: '00000000-0000-4000-8000-000000000013',
    sourceType: 'coupang_rocket_matching_csv',
    channelAccountId: input.channelAccountId,
    fileName: input.fileName,
    fileHash: input.fileHash,
    status: 'completed',
    rowCount: 1,
    importedAt: '2026-08-04T00:00:00.000Z',
    lastVerifiedAt: null,
    verificationCount: 0,
    lastTrigger: null,
    freshnessGeneration: null,
    manualFreshExportConfirmedAt: null,
    manualFreshExportConfirmedBy: null,
    qualityReport: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  },
  duplicate: false,
  changes: {
    createdProductCount: 1,
    updatedProductCount: 0,
    createdSkuCount: 1,
    updatedSkuCount: 0,
  },
};

describe('RocketSellpiaMatchingCsvImportService', () => {
  it('publishes the parsed Rocket identities under the selected account', async () => {
    const repository = {
      importMatchingCsv: vi.fn().mockResolvedValue(response),
    } satisfies Pick<RocketSellpiaMatchingCsvImportRepositoryPort, 'importMatchingCsv'>;
    const service = new RocketSellpiaMatchingCsvImportService(repository as never, { parseRocketMatchingCsv: (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) } as never);

    await expect(service.importMatchingCsv(csvInput(input))).resolves.toEqual(response);
    expect(repository.importMatchingCsv).toHaveBeenCalledWith(input);
  });

  it('rejects an empty parsed upload before it reaches persistence', async () => {
    const repository = {
      importMatchingCsv: vi.fn(),
    } satisfies Pick<RocketSellpiaMatchingCsvImportRepositoryPort, 'importMatchingCsv'>;
    const service = new RocketSellpiaMatchingCsvImportService(repository as never, { parseRocketMatchingCsv: (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) } as never);

    await expect(service.importMatchingCsv(csvInput({ ...input, rows: [] })))
      .rejects.toBeInstanceOf(ChannelInputError);
    expect(repository.importMatchingCsv).not.toHaveBeenCalled();
  });
});

function csvInput(input: PersistRocketSellpiaMatchingCsvInput): ImportRocketSellpiaMatchingCsvInput {
  const { rows, headers, ...metadata } = input;
  return { ...metadata, bytes: new TextEncoder().encode(JSON.stringify({ rows, headers })) };
}
