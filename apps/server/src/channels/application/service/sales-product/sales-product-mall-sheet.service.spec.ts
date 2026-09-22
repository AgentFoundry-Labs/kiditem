import { describe, expect, it, vi } from 'vitest';
import { SalesProductMallSheetService } from './sales-product-mall-sheet.service';
import type { SalesProductRepositoryPort } from '../../port/out/persistence/sales-product.repository.port';
import type { MallSheetSourceProduct } from '../../../domain/registration/bulk-sheet/mall-sheet-product';

const ORG = '10000000-0000-4000-8000-000000000001';
const PRODUCT = '10000000-0000-4000-8000-000000000002';
const OPTION = '10000000-0000-4000-8000-000000000003';
const FIRST = '10000000-0000-4000-8000-000000000004';
const SECOND = '10000000-0000-4000-8000-000000000005';
const ACCOUNT = '10000000-0000-4000-8000-000000000006';
const OTHER_PRODUCT = '10000000-0000-4000-8000-000000000007';
const OTHER_TARGET = '10000000-0000-4000-8000-000000000008';

function target(
  id: string,
  price: number | null,
  supplyPrice: number | null = 1500,
): MallSheetSourceProduct['overrides'][number] {
  return { targetId: id, mallKey: 'teacher-mall', name: id === FIRST ? '기본 등록' : '별도 등록',
    salePrice: null, priceRateBp: null, detailHtml: null, promoText: null,
    selectedOptionIds: [OPTION], optionPrices: [{ salesProductOptionId: OPTION, salePrice: price, normalPrice: null, supplyPrice }],
    adapterValues: { categoryCode: '0001' } };
}
function setup(overrides = [target(FIRST, 3000), target(SECOND, 5000)]) {
  const source: MallSheetSourceProduct = { id: PRODUCT, code: 'KID00000001', ownCode: null,
    name: '테스트 상품', brand: null, manufacturer: null, modelName: null, modelNo: null,
    originCountry: null, keywords: [], status: 'active', taxType: 'taxable', salePrice: 2000, tagPrice: null,
    imageUrls: ['https://example.com/product.jpg'], detailHtml: '<p>상품 설명</p>', noticeCategory: null,
    certificationNumbers: [], optionAxes: [], sabangnetImageUrls: [],
    options: [{ id: OPTION, code: 'KID00000002', values: [], salePrice: 2000, barcode: null, supplyStatus: 'selling' }], overrides };
  const repository = { readMallSheetProducts: vi.fn().mockResolvedValue([source]),
    readPublicImages: vi.fn().mockResolvedValue(new Map()), listMallCategoryPaths: vi.fn().mockResolvedValue([]),
    listChannelAccounts: vi.fn().mockResolvedValue([{ id: ACCOUNT, channel: 'teacher-mall' }]),
    setMallCategoryPaths: vi.fn().mockResolvedValue(1) };
  const files = { categoryTables: vi.fn().mockResolvedValue({ paths: {}, esmBySite: {}, coupang: {},
    icecream: { byCode: {}, ambiguous: {}, notices: {}, brands: {} } }), write: vi.fn().mockResolvedValue(Buffer.from('sheet')) };
  const activity = { log: vi.fn(), warn: vi.fn() };
  return { service: new SalesProductMallSheetService(repository as unknown as SalesProductRepositoryPort, files, activity), files, repository };
}

const chose = (targetId: string) => ({ salesProductId: PRODUCT, mallKey: 'teacher-mall', targetId });

describe('mall sheets use the explicitly selected registration settings', () => {
  it('reports the choices and refuses a file when several settings are unselected', async () => {
    const { service, files } = setup();
    const check = await service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    expect(check.blocked).toBe(1);
    expect(check.products[0]!.mallTargets).toEqual([{
      mallKey: 'teacher-mall',
      selectionRequired: true,
      targets: [
        { id: FIRST, label: '기본 등록', optionCount: 1, categoryPath: null },
        { id: SECOND, label: '별도 등록', optionCount: 1, categoryPath: null },
      ],
    }]);
    await expect(service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT] })).rejects.toThrow('등록 설정');
    expect(files.write).not.toHaveBeenCalled();
  });

  it('automatically uses a single setting without requiring a selection', async () => {
    const { service, files } = setup([target(FIRST, 3000)]);
    const request = { salesProductIds: [PRODUCT] };
    const check = await service.check(ORG, 'teacherville', request);
    expect(check.ready).toBe(1);
    expect(check.products[0]!.mallTargets).toEqual([{
      mallKey: 'teacher-mall',
      selectionRequired: false,
      targets: [{ id: FIRST, label: '기본 등록', optionCount: 1, categoryPath: null }],
    }]);
    await service.file(ORG, 'teacherville', request);
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ '할인가(판매가)': 3000 })]);
  });

  it('keeps the common-value flow when the product has no setting for the mall', async () => {
    const { service } = setup([]);
    const check = await service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT] });
    expect(check.products[0]!.mallTargets).toEqual([
      { mallKey: 'teacher-mall', selectionRequired: false, targets: [] },
    ]);
    // 설정이 없으면 공통값으로 계산하고, 막히더라도 설정 때문이 아니라 그 몰이 요구하는 값 때문이다.
    expect(check.products[0]!.problems.join(' ')).not.toContain('등록 설정');
    expect(check.products[0]!.categories).toHaveLength(1);
  });

  it('builds the file from the chosen setting, with the same prices the check reported', async () => {
    const { service, files } = setup();
    const request = { salesProductIds: [PRODUCT], targetIds: [chose(SECOND)] };
    const check = await service.check(ORG, 'teacherville', request);
    expect(check.ready).toBe(1);
    expect(check.products[0]!.rows).toBe(1);
    await service.file(ORG, 'teacherville', request);
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ '할인가(판매가)': 5000 })]);
  });

  it('prefers the chosen setting\'s explicit supply price over another setting\'s', async () => {
    const { service, files } = setup([target(FIRST, 3000, 900), target(SECOND, 5000, 4100)]);
    await service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chose(SECOND)] });
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ '공급가': 4100 })]);
  });

  it('refuses a setting that belongs to another product, mall or organization', async () => {
    const { service } = setup();
    for (const chosen of [
      { salesProductId: PRODUCT, mallKey: 'teacher-mall', targetId: OTHER_TARGET },
      { salesProductId: OTHER_PRODUCT, mallKey: 'teacher-mall', targetId: FIRST },
    ]) {
      await expect(service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chosen] }))
        .rejects.toThrow('등록 설정');
      await expect(service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chosen] }))
        .rejects.toThrow('등록 설정');
    }
  });

  it('tells a 0 won setting apart from a setting that names no price', async () => {
    // 0원은 "이 설정은 0원이다"라는 말이고, null 은 "이 설정은 값을 정하지 않았다"는 말이다.
    const zero = setup([target(FIRST, 0, 0), target(SECOND, null, null)]);
    const chosenZero = await zero.service.check(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chose(FIRST)] });
    expect(chosenZero.products[0]!.problems).toContain('판매가가 0원입니다.');
    await expect(zero.service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chose(FIRST)] }))
      .rejects.toThrow('0원');

    const chosenNull = setup([target(FIRST, 0, 0), target(SECOND, null, null)]);
    await chosenNull.service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chose(SECOND)] });
    // null 은 정본 단품 가격으로 물러서고, 공급가는 몰 고정값 비율(80%)로 계산한다.
    expect(chosenNull.files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({
      '할인가(판매가)': 2000,
      공급가: 1600,
    })]);
  });

  it('keeps an explicit 0 won supply price instead of recomputing it from the mall rate', async () => {
    const { service, files } = setup([target(FIRST, 3000, 0), target(SECOND, 3000, null)]);
    await service.file(ORG, 'teacherville', { salesProductIds: [PRODUCT], targetIds: [chose(FIRST)] });
    expect(files.write.mock.calls[0]![1]).toEqual([expect.objectContaining({ 공급가: 0 })]);
  });

  it('refuses a setting for a mall this sheet does not cover', async () => {
    const { service } = setup();
    await expect(service.check(ORG, 'teacherville', {
      salesProductIds: [PRODUCT],
      targetIds: [{ salesProductId: PRODUCT, mallKey: 'gmarket', targetId: FIRST }],
    })).rejects.toThrow('이 엑셀이 다루는 몰이 아닙니다');
  });

  it('refuses two settings for one product and mall', async () => {
    const { service } = setup();
    await expect(service.file(ORG, 'teacherville', {
      salesProductIds: [PRODUCT],
      targetIds: [chose(FIRST), chose(SECOND)],
    })).rejects.toThrow('하나');
  });

  it('saves a category only on the chosen setting', async () => {
    const { service, repository } = setup();
    await service.assignCategory(ORG, {
      mallKey: 'teacher-mall',
      path: '완구>블록',
      salesProductIds: [PRODUCT],
      targetIds: [{ salesProductId: PRODUCT, targetId: SECOND }],
    });
    expect(repository.setMallCategoryPaths).toHaveBeenCalledWith(ORG, [
      { salesProductId: PRODUCT, channelAccountId: ACCOUNT, targetId: SECOND, path: '완구>블록' },
    ]);
  });

  it('refuses a category save that does not say which of several settings to change', async () => {
    const { service, repository } = setup();
    await expect(service.assignCategory(ORG, {
      mallKey: 'teacher-mall',
      path: '완구>블록',
      salesProductIds: [PRODUCT],
    })).rejects.toThrow('등록 설정');
    expect(repository.setMallCategoryPaths).not.toHaveBeenCalled();
  });

  it('saves without a selection when the product has one setting or none', async () => {
    const { service, repository } = setup([target(FIRST, 3000)]);
    await service.assignCategory(ORG, { mallKey: 'teacher-mall', path: '완구>블록', salesProductIds: [PRODUCT] });
    expect(repository.setMallCategoryPaths).toHaveBeenCalledWith(ORG, [
      { salesProductId: PRODUCT, channelAccountId: ACCOUNT, targetId: undefined, path: '완구>블록' },
    ]);
  });
});
