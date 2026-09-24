import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_ID,
  EMPTY_REGISTRATION_MEDIA,
  draftRoutes,
  salesProductDraft,
  sourcingCandidateResponse,
} from '@/test/fixtures/sales-product-draft';

const api = vi.hoisted(() => ({ get: vi.fn(), getParsed: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { useMallQuickRegister } from './useMallQuickRegister';
import { coupangWingAdapter } from '@/app/(channels)/_shared/adapters';

const routes = draftRoutes();

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function serveDraft(salePrice: number | null) {
  api.getParsed.mockImplementation(async (url: string) => {
    if (url === routes.draft) {
      return salesProductDraft({
        name: '할로윈 LED 거미줄',
        options: [{ ...salesProductDraft().options[0]!, salePrice, normalPrice: null }],
      });
    }
    throw new Error(`unexpected getParsed ${url}`);
  });
  api.get.mockImplementation(async (url: string) => {
    if (url === routes.candidate) return sourcingCandidateResponse({ sellPrice: 3500 });
    if (url === routes.media) return EMPTY_REGISTRATION_MEDIA;
    throw new Error(`unexpected get ${url}`);
  });
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
      () => useMallQuickRegister({ salesProductId: DRAFT_ID, enabled: true }),
      { wrapper: wrapper(queryClient) },
    );

  it('판매상품 초안 id 로 상세를 읽는다 — 후보 id 로 묻지 않는다', async () => {
    serveDraft(3500);
    const hook = render(client());

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(api.getParsed).toHaveBeenCalledWith(routes.draft, expect.anything());
    expect(api.get.mock.calls.map(([url]) => url).sort()).toEqual([routes.candidate, routes.media].sort());
  });

  it('값이 없으면 그 몰만 막고 이유를 남긴다', async () => {
    serveDraft(3500);
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
    serveDraft(null);
    const hook = render(client());

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    for (const row of hook.result.current.readiness) {
      expect(row.reasons.some((reason) => reason.includes('판매가가 0원'))).toBe(false);
    }
  });

  it('확인 창이 필요한 몰은 맨 위 줄로 서고, 화면이 확인 창을 열도록 따로 알린다', async () => {
    serveDraft(3500);
    const hook = render(client());

    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(hook.result.current.readiness[0]?.mallKey).toBe('coupang');
    expect(hook.result.current.confirmationMallKeys).toEqual(['coupang']);
    expect(hook.result.current).not.toHaveProperty('wingReadiness');
  });

  it('확인 창에서 정한 값과 계정으로 폼만 채우고 그 줄에 결과를 남긴다', async () => {
    serveDraft(3500);
    const send = vi.spyOn(coupangWingAdapter, 'send').mockResolvedValue({
      ok: true, confirmed: false, submitted: false, manualSteps: ['열린 탭에서 확인하세요.'], warnings: [],
    });
    const hook = render(client());
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    const account = { id: 'account-1', channel: 'coupang', name: '본점', externalAccountId: null, vendorId: 'A00012345', sellerId: null, isPrimary: true };
    await act(async () => {
      await hook.result.current.fillConfirmed('coupang', { values: { productName: '이름' }, channelAccount: account });
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ channelAccount: account }));
    expect(send.mock.calls[0]![0].items[0]).not.toHaveProperty('targetExecution');
    expect(hook.result.current.results.coupang?.status).toBe('filled');
    send.mockRestore();
  });

  it('상세를 못 읽는 동안에는 버튼을 열지 않는다', () => {
    api.getParsed.mockReturnValue(new Promise(() => {}));
    api.get.mockReturnValue(new Promise(() => {}));
    const hook = render(client());
    expect(hook.result.current.isLoading).toBe(true);
  });
});
