import { ChannelIntegrityAdapter } from '../../../adapter/out/integrity/channel-integrity.adapter';
import { ChannelsDocumentsAdapter } from '../../../adapter/out/documents/channel-documents.adapter';
import * as XLSX from 'xlsx';
import { ChannelConflictError as ConflictException, ChannelInputError as BadRequestException } from '../../../domain/exception/channel-business-error';
import { describe, expect, it, vi } from 'vitest';
import type { ProductSourceReadPort } from '../../../../products/application/port/in/product-source-read.port';
import type { ProductSourceReadModel } from '../../../../products/domain/product-source-read-model';
import type { ExistingSalesProductOption } from '../../../domain/sales-product/sales-product';
import type { SalesProductImageMirrorPort } from '../../port/out/storage/sales-product-image-mirror.port';
import type {
  SalesProductOptionState,
  SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';
import { SabangnetProductImportService } from './sabangnet-product-import.service';
import type { SalesProductLinkService } from '../sales-product/sales-product-link.service';

const channelIntegrity = new ChannelIntegrityAdapter();

const ORGANIZATION_ID = 'org-1';
const PRODUCT_ID = 'sales-product-1';
const EXISTING_PRODUCT_CODE = 'KID-EXISTING-PRODUCT';
const EXISTING_OPTION_ID = 'sales-product-option-1';
const EXISTING_OPTION_CODE = 'KID-EXISTING-OPTION';
const SOURCE_PRODUCT_ID = 'master-product-1';
const SOURCE_PRODUCT_CODE = 'KID-SOURCE-1';
const SABANGNET_GOODS_NO = '100017';
const SABANGNET_OPTION_CODE = '100017-0001';

const LINK_RESULT = {
  linkedListings: 0,
  alreadyLinked: 0,
  linkedOptions: 0,
  recipesFilled: 0,
  conflicts: 0,
  bySource: { sabangnet_record: 0, send_record_file: 0, seller_code: 0 },
};

const PRODUCT_HEADERS = [
  '품번코드', '상품명', '모델명', '모델NO', '자체상품코드', '판매가', 'TAG가', '옵션제목(1)', '옵션상세명칭(1)',
];
const OPTION_HEADERS = ['사방넷상품코드', '옵션상세명칭', '공급상태', '단품추가금액', '옵션제목', '모델명'];

function workbook(title: string, headers: string[], rows: (string | number | null)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [title],
    headers,
    headers.map((header) => `▶${header} 설명`),
    ...rows,
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function productFile(): { originalname: string; buffer: Buffer } {
  return {
    originalname: 'products.xlsx',
    buffer: workbook('상품관리 > 사방넷상품대량수정', PRODUCT_HEADERS, [[
      SABANGNET_GOODS_NO,
      '투명우산 그리기',
      '8321-1',
      '8321-1',
      'OWN-100017',
      2880,
      5000,
      '단품',
      '단품',
    ]]),
  };
}

function optionFile(): { originalname: string; buffer: Buffer } {
  return {
    originalname: 'options.xlsx',
    buffer: workbook('상품관리 > 사방넷단품대량수정', OPTION_HEADERS, [[
      SABANGNET_OPTION_CODE,
      '단품',
      '1',
      500,
      '단품',
      '8321-1',
    ]]),
  };
}

function sendRecordsFile(): { originalname: string; buffer: Buffer } {
  return {
    originalname: 'send-records.xlsx',
    buffer: workbook('쇼핑몰상품수정', ['쇼핑몰상품코드', '쇼핑몰코드', '품번코드'], []),
  };
}

const sourceProduct: ProductSourceReadModel = {
  masterProductId: SOURCE_PRODUCT_ID,
  code: SOURCE_PRODUCT_CODE,
  sourceAccountKey: 'sellpia',
  sourceProductCode: '8321',
  sourceOptionCode: '1',
  name: '투명우산 그리기',
  optionName: null,
  barcode: null,
  purchasePrice: 1200,
  imageUrls: [],
};

function existingOption(): ExistingSalesProductOption {
  return {
    id: EXISTING_OPTION_ID,
    optionCode: EXISTING_OPTION_CODE,
    sabangnetOptionCode: SABANGNET_OPTION_CODE,
    optionKey: '',
    linkedChannelOptionCount: 0,
    components: [{ masterProductId: SOURCE_PRODUCT_ID, quantity: 1 }],
  };
}

function existingState(): SalesProductOptionState {
  return {
    productId: PRODUCT_ID,
    productCode: EXISTING_PRODUCT_CODE,
    productName: '사방넷 상품',
    status: 'active',
    version: 7,
    options: [existingOption()],
  };
}

function harness(state: SalesProductOptionState | null, result: {
  created: number;
  updated: number;
  unchanged: number;
  overridesSaved: number;
}, stateKeys: readonly string[] = [SABANGNET_GOODS_NO]) {
  const repository = {
    listChannelAccounts: vi.fn().mockResolvedValue([]),
    readImportOptionStates: vi.fn().mockResolvedValue(
      state ? new Map(stateKeys.map((key) => [key, state] as const)) : new Map(),
    ),
    readImportFingerprints: vi.fn().mockResolvedValue(new Map()),
    readMasterProductCodes: vi.fn().mockResolvedValue(new Map([[SOURCE_PRODUCT_ID, SOURCE_PRODUCT_CODE]])),
    allocateCode: vi.fn().mockResolvedValue('KID-NEW-PRODUCT'),
    importSabangnet: vi.fn().mockResolvedValue(result),
  } as unknown as SalesProductRepositoryPort;
  const sourceProducts = {
    listActiveForMatching: vi.fn().mockResolvedValue([sourceProduct]),
  } as unknown as ProductSourceReadPort;
  const links = {
    preview: vi.fn().mockResolvedValue(LINK_RESULT),
    autoLink: vi.fn().mockResolvedValue(LINK_RESULT),
  };
  const images = {
    mirror: vi.fn(),
    urlFor: vi.fn((key: string) => `https://storage.example/${key}`),
  } as unknown as SalesProductImageMirrorPort;
  const service = new SabangnetProductImportService(
    repository,
    sourceProducts,
    links as unknown as SalesProductLinkService,
    images,
    new ChannelsDocumentsAdapter(), { log() {}, warn() {} }, channelIntegrity,
  );
  return { service, repository };
}

describe('SabangnetProductImportService', () => {
  it('keeps an existing KID, source identity, final option price, and version across an explicit retry', async () => {
    const { service, repository } = harness(existingState(), {
      created: 0,
      updated: 1,
      unchanged: 0,
      overridesSaved: 0,
    });

    const files = [productFile(), optionFile()];
    const preview = await service.import(
      ORGANIZATION_ID,
      files,
      false,
      [{ salesProductId: PRODUCT_ID, expectedVersion: 7 }],
    );
    await service.import(ORGANIZATION_ID, files, false, [{ salesProductId: PRODUCT_ID, expectedVersion: 7 }]);

    expect(preview.products).toEqual({ total: 1, created: 0, updated: 1, unchanged: 0 });
    expect(preview.existingChanges).toEqual([{
      salesProductId: PRODUCT_ID,
      code: EXISTING_PRODUCT_CODE,
      name: '투명우산 그리기',
      sourceKey: SABANGNET_GOODS_NO,
      expectedVersion: 7,
      changed: true,
    }]);
    expect(repository.readImportOptionStates).toHaveBeenCalledWith(ORGANIZATION_ID, [SABANGNET_GOODS_NO, 'OWN-100017']);
    expect(repository.importSabangnet).toHaveBeenCalledTimes(2);
    for (const [, writes] of (repository.importSabangnet as ReturnType<typeof vi.fn>).mock.calls) {
      const [write] = writes;
      expect(write).toMatchObject({
        mode: 'upsert',
        existingProductId: PRODUCT_ID,
        expectedVersion: 7,
        create: { code: EXISTING_PRODUCT_CODE },
      });
      expect(write.plan.writes).toEqual([
        expect.objectContaining({
          id: EXISTING_OPTION_ID,
          optionCode: EXISTING_OPTION_CODE,
          sabangnetOptionCode: SABANGNET_OPTION_CODE,
          salePrice: 3380,
          normalPrice: 5000,
          components: [{ masterProductId: SOURCE_PRODUCT_ID, quantity: 1 }],
        }),
      ]);
    }
    expect(repository.allocateCode).not.toHaveBeenCalled();
    expect(repository.readMasterProductCodes).not.toHaveBeenCalled();
  });

  it('preserves a changed existing product by default until its id is explicitly selected', async () => {
    const { service, repository } = harness(existingState(), {
      created: 0,
      updated: 0,
      unchanged: 1,
      overridesSaved: 0,
    });

    const preview = await service.import(ORGANIZATION_ID, [productFile(), optionFile()], false);

    expect(preview.products).toEqual({ total: 1, created: 0, updated: 0, unchanged: 1 });
    expect(preview.existingChanges[0]).toMatchObject({
      salesProductId: PRODUCT_ID,
      sourceKey: SABANGNET_GOODS_NO,
      expectedVersion: 7,
      changed: true,
    });
    const [write] = (repository.importSabangnet as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(write).toMatchObject({
      mode: 'preserve',
      existingProductId: PRODUCT_ID,
      expectedVersion: 7,
      create: { code: EXISTING_PRODUCT_CODE },
    });
    expect(write.plan.writes[0]).toMatchObject({
      optionCode: EXISTING_OPTION_CODE,
      sabangnetOptionCode: SABANGNET_OPTION_CODE,
      salePrice: 3380,
    });
    expect(repository.allocateCode).not.toHaveBeenCalled();
    expect(repository.readMasterProductCodes).not.toHaveBeenCalled();
  });

  it('matches an existing product through its own source key when that is the stored identity', async () => {
    const { service } = harness(existingState(), {
      created: 0,
      updated: 0,
      unchanged: 1,
      overridesSaved: 0,
    }, ['OWN-100017']);

    const preview = await service.import(ORGANIZATION_ID, [productFile(), optionFile()], true);

    expect(preview.products).toEqual({ total: 1, created: 0, updated: 0, unchanged: 1 });
    expect(preview.existingChanges).toEqual([expect.objectContaining({
      salesProductId: PRODUCT_ID,
      sourceKey: 'OWN-100017',
      expectedVersion: 7,
    })]);
  });

  it('issues KID identities only for a new product while retaining external source codes', async () => {
    const { service, repository } = harness(null, {
      created: 1,
      updated: 0,
      unchanged: 0,
      overridesSaved: 0,
    });

    const preview = await service.import(ORGANIZATION_ID, [productFile(), optionFile()], false);

    expect(preview.products).toEqual({ total: 1, created: 1, updated: 0, unchanged: 0 });
    const [write] = (repository.importSabangnet as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(write).toMatchObject({ mode: 'upsert', create: { code: 'KID-NEW-PRODUCT' } });
    expect(write.existingProductId).toBeUndefined();
    expect(write.expectedVersion).toBeUndefined();
    expect(write.plan.writes[0]).toMatchObject({
      optionCode: SOURCE_PRODUCT_CODE,
      sabangnetOptionCode: SABANGNET_OPTION_CODE,
      salePrice: 3380,
      normalPrice: 5000,
      components: [{ masterProductId: SOURCE_PRODUCT_ID, quantity: 1 }],
    });
    expect(repository.readMasterProductCodes).toHaveBeenCalledWith(ORGANIZATION_ID, [SOURCE_PRODUCT_ID]);
    expect(repository.allocateCode).toHaveBeenCalledTimes(1);
  });

  it('shows every existing match and its current version in a dry-run without writing', async () => {
    const { service, repository } = harness(existingState(), {
      created: 0,
      updated: 0,
      unchanged: 1,
      overridesSaved: 0,
    });

    const preview = await service.import(ORGANIZATION_ID, [productFile(), optionFile()], true);

    expect(preview.existingChanges).toEqual([expect.objectContaining({
      salesProductId: PRODUCT_ID,
      code: EXISTING_PRODUCT_CODE,
      sourceKey: SABANGNET_GOODS_NO,
      expectedVersion: 7,
      changed: true,
    })]);
    expect(repository.importSabangnet).not.toHaveBeenCalled();
  });

  it('keeps the selection list in the empty send-record preview contract', async () => {
    const { service } = harness(null, {
      created: 0,
      updated: 0,
      unchanged: 0,
      overridesSaved: 0,
    });

    const preview = await service.import(ORGANIZATION_ID, [sendRecordsFile()], true);

    expect(preview.existingChanges).toEqual([]);
  });

  it('rejects duplicate, unknown, and stale explicit selections before writing', async () => {
    const duplicate = harness(existingState(), {
      created: 0,
      updated: 0,
      unchanged: 1,
      overridesSaved: 0,
    });
    const files = [productFile(), optionFile()];

    await expect(duplicate.service.import(ORGANIZATION_ID, files, false, [
      { salesProductId: PRODUCT_ID, expectedVersion: 7 },
      { salesProductId: PRODUCT_ID, expectedVersion: 7 },
    ])).rejects.toThrow(BadRequestException);
    expect(duplicate.repository.importSabangnet).not.toHaveBeenCalled();

    const unknown = harness(existingState(), {
      created: 0,
      updated: 0,
      unchanged: 1,
      overridesSaved: 0,
    });
    await expect(unknown.service.import(ORGANIZATION_ID, files, false, [
      { salesProductId: 'sales-product-unknown', expectedVersion: 7 },
    ])).rejects.toThrow(BadRequestException);
    expect(unknown.repository.importSabangnet).not.toHaveBeenCalled();

    const stale = harness(existingState(), {
      created: 0,
      updated: 0,
      unchanged: 1,
      overridesSaved: 0,
    });
    await expect(stale.service.import(ORGANIZATION_ID, files, false, [
      { salesProductId: PRODUCT_ID, expectedVersion: 6 },
    ])).rejects.toThrow(ConflictException);
    expect(stale.repository.importSabangnet).not.toHaveBeenCalled();
  });
});
