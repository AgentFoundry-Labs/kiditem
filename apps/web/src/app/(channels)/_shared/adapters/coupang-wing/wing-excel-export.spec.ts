import { beforeEach, describe, expect, it, vi } from 'vitest';
import { salesProductApi } from '@/lib/sales-product-api';
import { requestWingRegistrationWorkbook } from './wing-registration-excel';
import { resolveWingCategorySelections } from './wing-product';

vi.mock('@/lib/sales-product-api', () => ({ salesProductApi: { get: vi.fn() } }));
vi.mock('./wing-registration-excel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./wing-registration-excel')>()),
  requestWingRegistrationWorkbook: vi.fn(),
}));
vi.mock('./wing-product', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./wing-product')>()),
  resolveWingCategorySelections: vi.fn(),
}));

const { generateWingExcelForSalesProducts } = await import('./wing-excel-export');

function product(id: string, name: string) {
  return {
    id, name, keywords: [], imageUrls: ['https://img.example/a.jpg'], colorVariantNames: [], standardCategory: null,
    options: [{ supplyStatus: 'selling', salePrice: 3000, normalPrice: null, optionCode: `KID-${id}` }],
  };
}

/** 쿠팡 WING 일괄등록 엑셀 — 판매상품마다 WING 상품 한 줄을 만들어 서버 양식 생성에 넘긴다. */
describe('generateWingExcelForSalesProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    vi.mocked(salesProductApi.get).mockImplementation(async (id: string) => product(id, `상품 ${id}`) as never);
    vi.mocked(resolveWingCategorySelections).mockResolvedValue(['64687', '77390']);
    vi.mocked(requestWingRegistrationWorkbook).mockResolvedValue({ bytes: new Uint8Array([1]), fileName: 'wing.xlsx' });
  });

  it('reads each sales product and sends one WING row per product with its resolved category', async () => {
    const result = await generateWingExcelForSalesProducts(['p1', 'p2']);

    expect(salesProductApi.get).toHaveBeenCalledTimes(2);
    const [, products] = vi.mocked(requestWingRegistrationWorkbook).mock.calls[0]!;
    expect(products.map((row) => [row.categoryCell.slice(0, 7), row.variants[0]?.vendorItemCode])).toEqual([
      ['[64687]', 'KID-p1'],
      ['[77390]', 'KID-p2'],
    ]);
    expect(result).toMatchObject({ fileName: 'wing.xlsx', productCount: 2 });
  });

  it('builds no file when nothing is selected', async () => {
    await expect(generateWingExcelForSalesProducts([])).rejects.toThrow('선택한 상품이 없습니다.');
    expect(requestWingRegistrationWorkbook).not.toHaveBeenCalled();
  });
});
