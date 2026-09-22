import { describe, expect, it } from 'vitest';
import { buildProductDepletionProjections } from './sellpia-product-depletion-projection';

/** 판매행 한 줄. 같은 SKU 로 해소된 줄들은 같은 SKU 값을 나눠 갖는다. */
function row(overrides: {
  sku: string;
  destinations: string[];
  needsReorder?: boolean;
  monthsLeft?: number | null;
  monthlyOutflow?: number | null;
  outflowMonthCount?: number;
}) {
  return {
    needsReorder: overrides.needsReorder ?? false,
    // `?? 0` 을 쓰면 일부러 넣은 null 이 0 으로 바뀐다 — 안 넣은 것과 갈라야 한다.
    monthlyOutflow: overrides.monthlyOutflow === undefined ? 0 : overrides.monthlyOutflow,
    outflowMonthCount: overrides.outflowMonthCount ?? 2,
    monthsOfAvailableStockLeft: overrides.monthsLeft ?? null,
    inventoryResolution: {
      status: 'matched' as const,
      masterProductId: overrides.sku,
      destinations: overrides.destinations.map((masterProductId) => ({ masterProductId })),
    },
  };
}

describe('buildProductDepletionProjections', () => {
  it('exposes the owner monthly average once for duplicated source rows', () => {
    const row = {
      needsReorder: true, monthsOfAvailableStockLeft: 0.4,
      monthlyOutflow: 25, outflowMonthCount: 2,
      inventoryResolution: { status: 'matched' as const, masterProductId: 'master-1',
        destinations: [{ masterProductId: 'master-1' }] },
    };
    const result = buildProductDepletionProjections(['master-1'], [row, row]);
    expect(result.get('master-1')).toMatchObject({ monthlyOutflow: 25, outflowMonthCount: 2 });
  });

  it('projects distinct matched SKUs to every destination without choosing a representative', () => {
    const result = buildProductDepletionProjections(
      ['master-1', 'master-2', 'master-3'],
      [
        row({
          sku: 'sku-1',
          destinations: ['master-1', 'master-2'],
          needsReorder: true,
          monthsLeft: 0.4,
          monthlyOutflow: 30,
        }),
        row({
          sku: 'sku-1',
          destinations: ['master-1'],
          monthsLeft: 2,
          monthlyOutflow: 30,
        }),
      ],
    );

    expect(result.get('master-1')).toEqual({
      coverage: 'shared',
      needsReorder: true,
      reorderSkuCount: 1,
      monthlyOutflow: 30,
      outflowMonthCount: 2,
      minMonthsOfAvailableStockLeft: 0.4,
    });
    expect(result.get('master-2')).toEqual(result.get('master-1'));
    expect(result.get('master-3')).toEqual({
      coverage: 'no_direct_sales',
      needsReorder: false,
      reorderSkuCount: 0,
      monthlyOutflow: null,
      outflowMonthCount: 0,
      minMonthsOfAvailableStockLeft: null,
    });
  });

  it('한 SKU 의 월 평균은 판매행 수만큼 더해지지 않는다', () => {
    // 같은 SKU 로 해소된 판매행 셋. 값은 이미 SKU 전체를 합친 것이라 한 번만 센다.
    const result = buildProductDepletionProjections(
      ['master-1'],
      [
        row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 40 }),
        row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 40 }),
        row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 40 }),
      ],
    );

    expect(result.get('master-1')?.monthlyOutflow).toBe(40);
  });

  it('상품이 SKU 를 여럿 가지면 그 SKU 들의 월 평균을 더한다', () => {
    const result = buildProductDepletionProjections(
      ['master-1'],
      [
        row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 40 }),
        row({ sku: 'sku-2', destinations: ['master-1'], monthlyOutflow: 15 }),
      ],
    );

    expect(result.get('master-1')?.monthlyOutflow).toBe(55);
  });

  it('SKU 하나라도 잴 근거가 없으면 부분 합 대신 비운다', () => {
    // 재고는 두 SKU 를 다 세는데 소진은 하나만 세면 남은 개월수가 실제보다 길어 보인다.
    const result = buildProductDepletionProjections(
      ['master-1'],
      [
        row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 40 }),
        row({ sku: 'sku-2', destinations: ['master-1'], monthlyOutflow: null, outflowMonthCount: 0 }),
      ],
    );

    expect(result.get('master-1')?.monthlyOutflow).toBeNull();
  });

  it('평균이 덮은 달 수는 가장 약한 근거를 따른다', () => {
    const result = buildProductDepletionProjections(
      ['master-1'],
      [
        row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 40, outflowMonthCount: 2 }),
        row({ sku: 'sku-2', destinations: ['master-1'], monthlyOutflow: 5, outflowMonthCount: 1 }),
      ],
    );

    expect(result.get('master-1')?.outflowMonthCount).toBe(1);
  });

  it('측정했더니 0개 나간 상품은 모르는 값이 아니다', () => {
    const result = buildProductDepletionProjections(
      ['master-1'],
      [row({ sku: 'sku-1', destinations: ['master-1'], monthlyOutflow: 0 })],
    );

    expect(result.get('master-1')?.monthlyOutflow).toBe(0);
  });
});
