import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { salesProductApi } from '@/lib/sales-product-api';
import { useSavedMallValues } from './use-saved-mall-values';

vi.mock('@/lib/sales-product-api', () => ({
  salesProductKeys: { detail: (id: string) => ['sales-products', 'detail', id] },
  salesProductApi: { get: vi.fn() },
}));
vi.mock('@/lib/registration-target-api', () => ({
  registrationTargetKeys: { list: (id: string) => ['registration-targets', 'list', id] },
  registrationTargetApi: { list: vi.fn() },
}));

const PRODUCT = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salesProductApi.get).mockResolvedValue({ id: PRODUCT, channelOverrides: [{ mallKey: 'onch', adapterValues: { packQuantity: '2' } }] } as never);
  vi.mocked(registrationTargetApi.list).mockResolvedValue([{
    id: 't', channelAccountId: ACCOUNT, registrationInput: { mallCategory: null, mallFields: { supplyPrice: '9000' }, adapter: {} },
  }] as never);
});

describe('useSavedMallValues', () => {
  it('⭐ 상품마다 그 몰 계정의 등록 설정 몰 값과 판매상품 몰별 값을 합쳐 돌려준다(실행이 얼리는 값과 같은 층)', async () => {
    const { result } = renderHook(() => useSavedMallValues(
      [{ candidateId: PRODUCT, name: '우산', salePrice: 1, thumbnailUrl: null, source: 'sales_product' }],
      ['onch'],
      { onch: ACCOUNT },
    ), { wrapper });

    await waitFor(() => expect(result.current.get(`${PRODUCT}:onch`)).toEqual({ packQuantity: '2', supplyPrice: '9000' }));
  });

  it('계정 행이 없는 몰은 판매상품 몰별 값만', async () => {
    const { result } = renderHook(() => useSavedMallValues(
      [{ candidateId: PRODUCT, name: '우산', salePrice: 1, thumbnailUrl: null, source: 'sales_product' }],
      ['onch'],
      {},
    ), { wrapper });
    await waitFor(() => expect(result.current.get(`${PRODUCT}:onch`)).toEqual({ packQuantity: '2' }));
  });
});
