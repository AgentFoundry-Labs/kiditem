import { describe, expect, it, vi } from 'vitest';
import { SalesProductMallSheetService } from './sales-product-mall-sheet.service';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';
import type { MallSheetSourceProduct } from '../../../domain/registration/bulk-sheet/mall-sheet-product';

const ORG = '10000000-0000-4000-8000-000000000001';
const PRODUCT = '10000000-0000-4000-8000-000000000002';
const OPTION = '10000000-0000-4000-8000-000000000003';
const FIRST = '10000000-0000-4000-8000-000000000004';
const ACCOUNT = '10000000-0000-4000-8000-000000000006';

function target(id: string, supplyPrice: string | null = '1500'): MallSheetSourceProduct['overrides'][number] {
  return { targetId: id, mallKey: 'teacher-mall', selectedOptionIds: [OPTION],
    adapterValues: { categoryCode: '0001', ...(supplyPrice === null ? {} : { supplyPrice }) } };
}
function setup(
  overrides = [target(FIRST)],
  product: Partial<Omit<MallSheetSourceProduct, 'detailHtml'>> = {},
  detailHtml: string | null = '<p>상품 설명</p>',
) {
  const source: Omit<MallSheetSourceProduct, 'detailHtml'> = { id: PRODUCT, code: 'KID00000001', ownCode: null,
    name: '테스트 상품', brand: null, manufacturer: null, modelName: null, modelNo: null,
    originCountry: null, keywords: [], status: 'active', taxType: 'taxable', salePrice: 2000, tagPrice: null,
    imageUrls: ['https://example.com/product.jpg'], noticeCategory: null,
    certificationNumbers: [], optionAxes: [], sabangnetImageUrls: [],
    options: [{ id: OPTION, code: 'KID00000002', values: [], salePrice: 2000, barcode: null, supplyStatus: 'selling' }],
    overrides, ...product };
  const repository = { readMallSheetProducts: vi.fn().mockResolvedValue([source]),
    readPublicImages: vi.fn().mockResolvedValue(new Map()), listMallCategoryPaths: vi.fn().mockResolvedValue([]),
    listChannelAccounts: vi.fn().mockResolvedValue([{ id: ACCOUNT, channel: 'teacher-mall' }]),
    setMallCategoryPaths: vi.fn().mockResolvedValue(1),
    // 파일을 만드는 순간이 판매 결정이다 — 서비스가 여기서 KID 를 발급한다.
    ensureCodes: vi.fn().mockResolvedValue({ code: 'KID00000001', issued: 0 }),
    ensureCodesForMany: vi.fn().mockResolvedValue(0) };
  const files = { categoryTables: vi.fn().mockResolvedValue({ paths: {}, esmBySite: {}, coupang: {},
    icecream: { byCode: {}, ambiguous: {}, notices: {}, brands: {} } }), write: vi.fn().mockResolvedValue(Buffer.from('sheet')) };
  const activity = { log: vi.fn(), warn: vi.fn() };
  // 상세는 Content revision 에서 온다 — 경계 밖이라 읽은 값만 정해 준다.
  const detailPages = {
    read: vi.fn(),
    importFromSource: vi.fn(),
    readMany: vi.fn().mockResolvedValue(new Map(detailHtml === null
      ? []
      : [[PRODUCT, { revisionId: 'revision-1', html: detailHtml, imageUrls: [] }]])),
  };
  return {
    service: new SalesProductMallSheetService(repository as unknown as SalesProductRepositoryPort, files, activity, detailPages),
    files,
    repository,
    detailPages,
  };
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
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({
      '할인가(판매가)': 2000,
      '상품설명(PC/태블릿)': '<p>상품 설명</p>',
    })]);
  });

  it('reads the detail from the product\'s content once per product and blocks a product without one', async () => {
    const { service, detailPages } = setup([target(FIRST)], {}, null);

    const check = await service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });

    expect(detailPages.readMany).toHaveBeenCalledWith({
      organizationId: ORG,
      products: [{ salesProductId: PRODUCT, selectedDetailPageRevisionId: null }],
    });
    expect(check.products[0]!.problems).toContain('상세설명이 비어 있습니다.');
  });

  it('keeps the common-value flow when the product has no setting for the mall', async () => {
    const { service } = setup([]);

    const check = await service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });

    expect(check.products[0]!.problems.join(' ')).not.toContain('등록 설정');
    expect(check.products[0]!.categories).toHaveLength(1);
  });

  it('takes the mall supply price from the mall field and falls back to the mall rate without one', async () => {
    const zero = setup([target(FIRST, '0')]);
    await zero.service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    expect(zero.files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ 공급가: 0 })]);

    const none = setup([target(FIRST, null)]);
    await none.service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    // 공급가 칸이 없으면 몰 고정값 비율(80%)로 계산한다.
    expect(none.files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ '할인가(판매가)': 2000, 공급가: 1600 })]);
  });

  /** 등록 동결 · 품절 송신과 같은 게이트다 — 판매가를 정하지 않은 초안은 파일에 들어가지 않는다. */
  it('⭐ refuses a draft whose selling price is still empty', async () => {
    const { service, files } = setup([target(FIRST)], {
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
