import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onchAdapter } from '../../_shared/adapters';
import { defaultAdapterValues, type MallPublishItem } from '../../_shared/mall-publish-adapter';
import { StepValues } from './StepValues';

vi.mock('@/lib/sales-product-api', () => ({
  salesProductKeys: { mallCategories: (key: string) => ['mall-categories', key] },
  salesProductApi: { mallCategories: vi.fn().mockResolvedValue({ categories: [] }) },
}));

afterEach(cleanup);

const item: MallPublishItem = {
  candidateId: '11111111-1111-4111-8111-111111111111', name: '곰돌이 우산', salePrice: 12000, thumbnailUrl: null, source: 'sales_product',
};

function mount(savedValues: ReadonlyMap<string, Record<string, string>>) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <StepValues
        adapters={[onchAdapter]}
        items={[item]}
        activeMallKey="onch"
        valuesByMall={{ onch: defaultAdapterValues(onchAdapter) }}
        editedValuesByMall={{}}
        savedValues={savedValues}
        blocks={[]}
        onSelectMall={vi.fn()}
        onChangeValue={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('StepValues — 저장된 몰별 값(QA D5)', () => {
  it('⭐ 등록 설정에 저장된 온채널 공급가를 미리보기와 칸 안내에 보인다 — 실행이 얼리는 값과 같게', () => {
    mount(new Map([[`${item.candidateId}:onch`, { supplyPrice: '9000' }]]));
    expect(screen.getByText('9,000원')).toBeTruthy();
    expect((screen.getByPlaceholderText('저장된 값 9000') as HTMLInputElement).value).toBe('');
  });

  it('저장된 값이 없으면 전처럼 미입력이다', () => {
    mount(new Map());
    expect(screen.getAllByText('미입력').length).toBeGreaterThan(0);
  });
});
