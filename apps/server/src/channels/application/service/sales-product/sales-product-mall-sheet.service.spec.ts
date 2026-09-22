import { describe, expect, it, vi } from 'vitest';
import { SalesProductMallSheetService } from './sales-product-mall-sheet.service';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';
import type { MallSheetSourceProduct } from '../../../domain/registration/bulk-sheet/mall-sheet-product';

const ORG = '10000000-0000-4000-8000-000000000001';
const PRODUCT = '10000000-0000-4000-8000-000000000002';
const OPTION = '10000000-0000-4000-8000-000000000003';
const FIRST = '10000000-0000-4000-8000-000000000004';
const ACCOUNT = '10000000-0000-4000-8000-000000000006';

function target(
  id: string,
  price: number | null,
  supplyPrice: number | null = 1500,
): MallSheetSourceProduct['overrides'][number] {
  return { targetId: id, mallKey: 'teacher-mall', name: '기본 등록',
    salePrice: null, priceRateBp: null, detailHtml: null, promoText: null,
    selectedOptionIds: [OPTION], optionPrices: [{ salesProductOptionId: OPTION, salePrice: price, normalPrice: null, supplyPrice }],
    adapterValues: { categoryCode: '0001' } };
}
function setup(overrides = [target(FIRST, 3000)], product: Partial<MallSheetSourceProduct> = {}) {
  const source: MallSheetSourceProduct = { id: PRODUCT, code: 'KID00000001', ownCode: null,
    name: '테스트 상품', brand: null, manufacturer: null, modelName: null, modelNo: null,
    originCountry: null, keywords: [], status: 'active', taxType: 'taxable', salePrice: 2000, tagPrice: null,
    imageUrls: ['https://example.com/product.jpg'], detailHtml: '<p>상품 설명</p>', noticeCategory: null,
    certificationNumbers: [], optionAxes: [], sabangnetImageUrls: [],
    options: [{ id: OPTION, code: 'KID00000002', values: [], salePrice: 2000, barcode: null, supplyStatus: 'selling' }],
    overrides, ...product };
  const repository = { readMallSheetProducts: vi.fn().mockResolvedValue([source]),
    readPublicImages: vi.fn().mockResolvedValue(new Map()), listMallCategoryPaths: vi.fn().mockResolvedValue([]),
    listChannelAccounts: vi.fn().mockResolvedValue([{ id: ACCOUNT, channel: 'teacher-mall' }]),
    setMallCategoryPaths: vi.fn().mockResolvedValue(1) };
  const files = { categoryTables: vi.fn().mockResolvedValue({ paths: {}, esmBySite: {}, coupang: {},
    icecream: { byCode: {}, ambiguous: {}, notices: {}, brands: {} } }), write: vi.fn().mockResolvedValue(Buffer.from('sheet')) };
  const activity = { log: vi.fn(), warn: vi.fn() };
  return { service: new SalesProductMallSheetService(repository as unknown as SalesProductRepositoryPort, files, activity), files, repository };
}

/**
 * 상품 × 몰 계정당 활성 등록 설정은 하나다(KID-310). 고를 것이 없으니 확인 · 파일 · 분류 저장은
 * 그 설정 하나를 그대로 쓰고, 설정이 없으면 공통값으로 계산한다. 행사용 등록은 별도 판매상품이다.
 */
describe('mall sheets use the single registration setting of each product and mall', () => {
  it('uses the one setting without asking anyone to choose', async () => {
    const { service, files } = setup();
    const request = { salesProductIds: [PRODUCT] };

    const check = await service.check(ORG, 'teacherville', request);

    expect(check.ready).toBe(1);
    expect(check.products[0]!.rows).toBe(1);
    await service.file(ORG, 'teacherville', request);
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ '할인가(판매가)': 3000 })]);
  });

  it('keeps the common-value flow when the product has no setting for the mall', async () => {
    const { service } = setup([]);

    const check = await service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });

    expect(check.products[0]!.problems.join(' ')).not.toContain('등록 설정');
    expect(check.products[0]!.categories).toHaveLength(1);
  });

  it('tells a 0 won setting apart from a setting that names no price', async () => {
    // 0원은 "이 설정은 0원이다"라는 말이고, null 은 "이 설정은 값을 정하지 않았다"는 말이다.
    const zero = setup([target(FIRST, 0, 0)]);
    const checked = await zero.service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    expect(checked.products[0]!.problems).toContain('판매가가 0원입니다.');
    await expect(zero.service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] })).rejects.toThrow('0원');

    const named = setup([target(FIRST, null, null)]);
    await named.service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    // null 은 정본 단품 가격으로 물러서고, 공급가는 몰 고정값 비율(80%)로 계산한다.
    expect(named.files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({
      '할인가(판매가)': 2000,
      공급가: 1600,
    })]);
  });

  it('keeps an explicit 0 won supply price instead of recomputing it from the mall rate', async () => {
    const { service, files } = setup([target(FIRST, 3000, 0)]);
    await service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ 공급가: 0 })]);
  });

  /** 등록 동결 · 품절 송신과 같은 게이트다 — 판매가를 정하지 않은 초안은 파일에 들어가지 않는다. */
  it('⭐ refuses a draft whose selling price is still empty', async () => {
    const { service, files } = setup([target(FIRST, 3000)], {
      status: 'draft',
      salePrice: null,
      options: [{ id: OPTION, code: null, values: [], salePrice: null, barcode: null, supplyStatus: 'selling' }],
    });

    await expect(service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] })).rejects.toThrow('판매가');
    expect(files.write).not.toHaveBeenCalled();
  });

  it('saves the category on that one setting', async () => {
    const { service, repository } = setup();

    await service.assignCategory(ORG, { mallKey: 'teacher-mall', path: '완구>블록', salesProductIds: [PRODUCT] });

    expect(repository.setMallCategoryPaths).toHaveBeenCalledWith(ORG, [
      { salesProductId: PRODUCT, channelAccountId: ACCOUNT, path: '완구>블록' },
    ]);
  });
});
