import { describe, expect, it, vi } from 'vitest';
import { SellpiaSalePriceAdapter } from '../sellpia-sale-price.adapter';

type SkuRow = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  isActive: boolean;
  lastImportRunId: string | null;
};

function sku(overrides: Partial<SkuRow> & Pick<SkuRow, 'name' | 'salePrice'>): SkuRow {
  return {
    sellpiaInventorySkuId: overrides.code ?? 'sku-1',
    code: overrides.code ?? 'CODE-1',
    optionName: null,
    barcode: null,
    currentStock: 0,
    purchasePrice: null,
    isActive: true,
    lastImportRunId: null,
    ...overrides,
  };
}

function makeAdapter(rows: SkuRow[]) {
  const findByNormalizedNames = vi.fn().mockResolvedValue(rows);
  const adapter = new SellpiaSalePriceAdapter({ findByNormalizedNames } as never);
  return { adapter, findByNormalizedNames };
}

describe('SellpiaSalePriceAdapter', () => {
  it('이름이 유일하게 걸리고 판매가가 양수면 매칭을 돌려준다', async () => {
    const { adapter, findByNormalizedNames } = makeAdapter([
      sku({ code: 'A', name: '4000과일바구니딸깍이키링', salePrice: 4000 }),
    ]);

    const result = await adapter.findSalePricesByNormalizedNames('org-1', [
      '4000과일바구니딸깍이키링',
    ]);

    expect(result).toEqual([{ normalizedName: '4000과일바구니딸깍이키링', salePrice: 4000 }]);
    expect(findByNormalizedNames).toHaveBeenCalledWith('org-1', ['4000과일바구니딸깍이키링']);
  });

  it('같은 이름에 서로 다른 판매가가 걸리면 모호하므로 제외한다', async () => {
    const { adapter } = makeAdapter([
      sku({ code: 'A', name: '무지개슬라임', salePrice: 3000 }),
      sku({ code: 'B', name: '무지개슬라임', salePrice: 5000 }),
    ]);

    // 최저가/첫 행을 임의로 고르면 조용히 틀린 가격이 된다. 포기가 맞다.
    expect(await adapter.findSalePricesByNormalizedNames('org-1', ['무지개슬라임'])).toEqual([]);
  });

  it('같은 이름의 옵션 행들이 모두 같은 양수 판매가면 답이 하나로 확정된다', async () => {
    const { adapter } = makeAdapter([
      sku({ code: 'A', name: '무지개슬라임', optionName: '빨강', salePrice: 3000 }),
      sku({ code: 'B', name: '무지개슬라임', optionName: '파랑', salePrice: 3000 }),
    ]);

    expect(await adapter.findSalePricesByNormalizedNames('org-1', ['무지개슬라임'])).toEqual([
      { normalizedName: '무지개슬라임', salePrice: 3000 },
    ]);
  });

  it('판매가가 비어 있는 행이 섞여 있으면 제외한다', async () => {
    const { adapter } = makeAdapter([
      sku({ code: 'A', name: '무지개슬라임', salePrice: null }),
      sku({ code: 'B', name: '무지개슬라임', salePrice: 3000 }),
    ]);

    expect(await adapter.findSalePricesByNormalizedNames('org-1', ['무지개슬라임'])).toEqual([]);
  });

  it('판매가가 없거나 0인 단일 행은 매칭으로 치지 않는다', async () => {
    const { adapter } = makeAdapter([
      sku({ code: 'A', name: '가격없음', salePrice: null }),
      sku({ code: 'B', name: '영원짜리', salePrice: 0 }),
    ]);

    expect(
      await adapter.findSalePricesByNormalizedNames('org-1', ['가격없음', '영원짜리']),
    ).toEqual([]);
  });

  it('빈 키는 조회 자체를 하지 않는다', async () => {
    const { adapter, findByNormalizedNames } = makeAdapter([]);

    expect(await adapter.findSalePricesByNormalizedNames('org-1', ['', ''])).toEqual([]);
    expect(findByNormalizedNames).not.toHaveBeenCalled();
  });

  it('중복 키는 한 번만 조회한다', async () => {
    const { adapter, findByNormalizedNames } = makeAdapter([]);

    await adapter.findSalePricesByNormalizedNames('org-1', ['같은키', '같은키']);

    expect(findByNormalizedNames).toHaveBeenCalledWith('org-1', ['같은키']);
  });
});
