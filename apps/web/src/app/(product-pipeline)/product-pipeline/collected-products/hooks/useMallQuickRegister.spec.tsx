import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const mockGetDetail = vi.hoisted(() => vi.fn());

vi.mock(
  '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    productsApi: { getDetail: mockGetDetail },
  }),
);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { useMallQuickRegister } from './useMallQuickRegister';

const CANDIDATE = '7dbe40a5-8684-4347-b790-c54f014f627d';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function detail(basics: Record<string, unknown> = {}) {
  return {
    id: CANDIDATE,
    name: '할로윈 LED 거미줄',
    status: 'sourced',
    price_krw: 3500,
    thumbnail_url: null,
    thumbnailUrl: null,
    processed_data: null,
    basicInfo: {
      name: '할로윈 LED 거미줄',
      category: '',
      tags: [],
      keywords: [],
      thumbnailUrls: [],
      originalPrice: 0,
      salePrice: 3500,
      discountRate: 0,
      ...basics,
    },
  };
}

describe('useMallQuickRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // useProductDetail 이 템플릿 CSS 를 함께 읽는다. 이 훅의 관심사가 아니다.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));
  });

  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const render = (queryClient: QueryClient) =>
    renderHook(
      () => useMallQuickRegister({ candidateId: CANDIDATE, enabled: true }),
      { wrapper: wrapper(queryClient) },
    );

  it('⭐ 상세 캐시를 워크스페이스 모양으로 남긴다 — 상품 상세 화면과 같은 키를 쓴다', async () => {
    // 회귀(라이브 2026-09-10): 이 훅이 같은 키(`sourcing.detail(id)`)에 **날것의**
    // 상세 응답을 써 넣었더니, 모달을 연 뒤 상품 상세로 들어갔을 때
    // `fetchedData.product` 가 undefined 가 되어 화면이 통째로 죽었다.
    // 캐시 모양은 `useProductDetail` 이 소유한다 — 여기서 다시 만들지 않는다.
    mockGetDetail.mockResolvedValue(detail());
    const queryClient = client();
    const hook = render(queryClient);

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    const cached = queryClient.getQueryData(queryKeys.sourcing.detail(CANDIDATE)) as
      | { product?: { basicInfo?: unknown }; editState?: unknown }
      | undefined;
    expect(cached?.product?.basicInfo).toBeDefined();
    expect(cached?.editState).toBeDefined();
  });

  it('상품 상세에 저장한 몰별 값을 읽어 쓴다', async () => {
    mockGetDetail.mockResolvedValue(detail({
      mallRegisterValues: {
        '11st': { categoryPath: '문구/사무용품>디자인/팬시용품>기능성 팬시' },
        always: { teamPrice: '1800' },
      },
    }));
    const hook = render(client());

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.values.byMall['11st']?.categoryPath)
      .toBe('문구/사무용품>디자인/팬시용품>기능성 팬시');
    // 저장한 값을 채우면 모든 폼 몰이 열린다.
    expect(hook.result.current.readiness.every((row) => row.ready)).toBe(true);
  });

  it('값이 없으면 그 몰만 막고 이유를 남긴다', async () => {
    mockGetDetail.mockResolvedValue(detail());
    const hook = render(client());

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    const eleventh = hook.result.current.readiness.find((row) => row.mallKey === '11st')!;
    expect(eleventh.ready).toBe(false);
    expect(eleventh.missingFieldLabels).toContain('11번가 분류');
    expect(hook.result.current.readyMallKeys).not.toContain('11st');
  });

  it('판매가는 상세에서 읽는다 — 목록에는 가격 칸이 없다', async () => {
    // 셀피아 이름매칭이 실패하면 상세 판매가가 0 으로 온다. 0 을 0원 상품으로 읽으면
    // 멀쩡한 상품이 막히므로 "모른다"로 접고 목록 값으로 폴백한다.
    mockGetDetail.mockResolvedValue(detail({ salePrice: 0 }));
    const hook = render(client());

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    for (const row of hook.result.current.readiness) {
      expect(row.reasons.some((reason) => reason.includes('판매가가 0원'))).toBe(false);
    }
  });

  it('상세를 못 읽는 동안에는 버튼을 열지 않는다', () => {
    mockGetDetail.mockReturnValue(new Promise(() => {}));
    const hook = render(client());
    expect(hook.result.current.isLoading).toBe(true);
  });
});
