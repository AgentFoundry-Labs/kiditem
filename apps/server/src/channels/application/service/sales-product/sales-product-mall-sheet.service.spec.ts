import { describe, expect, it, vi } from 'vitest';
import { SalesProductMallSheetService } from './sales-product-mall-sheet.service';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';
import type { MallSheetSourceProduct } from '../../../domain/registration/bulk-sheet/mall-sheet-product';

const ORG = '10000000-0000-4000-8000-000000000001';
const PRODUCT = '10000000-0000-4000-8000-000000000002';
const OPTION = '10000000-0000-4000-8000-000000000003';
const FIRST = '10000000-0000-4000-8000-000000000004';
const SECOND = '10000000-0000-4000-8000-000000000005';

function target(id: string, price: number): MallSheetSourceProduct['overrides'][number] {
  return { targetId: id, mallKey: 'teacher-mall', name: id === FIRST ? '기본 등록' : '별도 등록',
    salePrice: null, priceRateBp: null, detailHtml: null, promoText: null,
    selectedOptionIds: [OPTION], optionPrices: [{ salesProductOptionId: OPTION, salePrice: price, normalPrice: null, supplyPrice: 1500 }],
    adapterValues: { categoryCode: '0001' } };
}
function setup(overrides = [target(FIRST, 3000), target(SECOND, 5000)]) {
  const source: MallSheetSourceProduct = { id: PRODUCT, code: 'KID00000001', ownCode: null,
    name: '테스트 상품', brand: null, manufacturer: null, modelName: null, modelNo: null,
    originCountry: null, keywords: [], taxType: 'taxable', salePrice: 2000, tagPrice: null,
    imageUrls: ['https://example.com/product.jpg'], detailHtml: '<p>상품 설명</p>', noticeCategory: null,
    certificationNumbers: [], optionAxes: [], sabangnetImageUrls: [],
    options: [{ id: OPTION, code: 'KID00000002', values: [], salePrice: 2000, barcode: null, supplyStatus: 'selling' }], overrides };
  const repository = { readMallSheetProducts: vi.fn().mockResolvedValue([source]),
    readPublicImages: vi.fn().mockResolvedValue(new Map()), listMallCategoryPaths: vi.fn().mockResolvedValue([]),
    listChannelAccounts: vi.fn().mockResolvedValue([{ id: ORG, channel: 'teacher-mall' }]),
    setMallCategoryPaths: vi.fn().mockResolvedValue(1) };
  const files = { categoryTables: vi.fn().mockResolvedValue({ paths: {}, esmBySite: {}, coupang: {},
    icecream: { byCode: {}, ambiguous: {}, notices: {}, brands: {} } }), write: vi.fn().mockResolvedValue(Buffer.from('sheet')) };
  const activity = { log: vi.fn(), warn: vi.fn() };
  return { service: new SalesProductMallSheetService(repository as unknown as SalesProductRepositoryPort, files, activity), files, repository };
}

describe('mall sheets use the explicitly selected registration settings', () => {
  it('reports the choices and refuses a file when several settings are unselected', async () => {
    const { service, files } = setup();
    const check = await service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    expect(check.blocked).toBe(1);
    await expect(service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] })).rejects.toThrow('등록 설정');
    expect(files.write).not.toHaveBeenCalled();
  });

  it('automatically uses a single setting without requiring a selection', async () => {
    const { service, files } = setup([target(FIRST, 3000)]);
    const request = { salesProductIds: [PRODUCT] };
    expect((await service.check(ORG, 'teacherville', request)).ready).toBe(1);
    await service.file(ORG, 'teacherville', request);
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ '할인가(판매가)': 3000 })]);
  });

});
