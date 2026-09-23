import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SourcingPage from './page';

const {
  pushMock,
  toastMock,
  startMock,
  runMallsMock,
  fillConfirmedMock,
  invalidateMock,
} = vi.hoisted(() => ({
  invalidateMock: vi.fn(),
  pushMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  startMock: vi.fn(),
  runMallsMock: vi.fn(),
  fillConfirmedMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('sonner', () => ({ toast: toastMock }));

// 몰 등록 흐름만 본다 — 목록 · 삭제 · AI 작업은 page.spec.tsx 가 실제 QueryClient 로 본다.
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateMock }),
  useQuery: () => ({
    data: {
      items: [{ id: 'sales-product-1', sourceRecordId: 'record-1', name: '테스트 상품', status: 'draft', imageUrl: null }],
      total: 1,
      summary: { draft: 1 },
    },
    isLoading: false,
    isPlaceholderData: false,
  }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

const ITEM = { candidateId: 'record-1', source: 'candidate', salesProductId: 'sales-product-1', name: '테스트 상품', salePrice: 3000, thumbnailUrl: null };

vi.mock('./hooks/useMallQuickRegister', () => ({
  useMallQuickRegister: () => ({
    item: ITEM,
    readiness: [
      { mallKey: 'coupang', mallName: '쿠팡 WING', ready: true, reasons: [], missingFieldLabels: [], summary: [] },
      { mallKey: 'kidsnote', mallName: '키즈노트', ready: true, reasons: [], missingFieldLabels: [], summary: [] },
    ],
    results: {},
    runningMallKeys: [],
    isLoading: false,
    confirmationMallKeys: ['coupang'],
    runMalls: runMallsMock,
    fillConfirmed: fillConfirmedMock,
  }),
}));

vi.mock('@/app/(channels)/_shared/use-mall-publish-run', () => ({
  useMallPublishRun: () => ({ start: startMock, tasks: [], running: false, cancel: vi.fn(), reset: vi.fn() }),
}));

const ACCOUNT = { id: 'account-1', channel: 'coupang', name: '본점', externalAccountId: null, vendorId: 'A00012345', sellerId: null, isPrimary: true };
const VALUES = { wingCategoryKey: '64687', productName: '노출 이름' };

vi.mock('@/app/(channels)/_shared/RegistrationConfirmDialog', () => ({
  RegistrationConfirmDialog: ({ adapter, onConfirm }: { adapter: { mallKey: string } | null; onConfirm: (input: unknown) => void }) =>
    adapter ? (
      <div role="dialog" aria-label={`${adapter.mallKey} 확인 창`}>
        <button type="button" onClick={() => onConfirm({ submit: true, channelAccount: ACCOUNT, values: VALUES, adapterValues: { sellpiaInventorySkuId: 'sku-1', sellpiaQuantity: '1' } })}>
          확인 창 등록 실행
        </button>
        <button type="button" onClick={() => onConfirm({ submit: false, channelAccount: ACCOUNT, values: VALUES, adapterValues: {} })}>
          확인 창 폼 채우기
        </button>
      </div>
    ) : null,
}));

vi.mock('./lib/sourcing-api', () => ({
  salesProductGenerationApi: { start: vi.fn() },
  searchSellpiaInventorySkus: vi.fn(),
}));
vi.mock('./hooks/useScrapeUrl', () => ({ useScrapeUrl: () => ({ showScrapeInput: false }) }));
vi.mock('./hooks/useStartedGenerationProgress', () => ({
  useStartedGenerationProgress: () => ({ runningSalesProductIds: [], runningDetailCount: 0, runningThumbnailCount: 0 }),
}));
vi.mock('../_shared/components/inbox/ProductPipelineHeader', () => ({ ProductPipelineHeader: () => null }));
vi.mock('../_shared/components/inbox/ProductPipelineStats', () => ({ ProductPipelineStats: () => null }));
vi.mock('@/components/ui/Pagination', () => ({ Pagination: () => null }));
vi.mock('./components/list/ScrapeUrlInput', () => ({ default: () => null }));
vi.mock('./components/list/SourcingToolbar', () => ({ default: () => null }));
vi.mock('./components/list/ProductList', () => ({
  default: ({ onOpenQuickProcess }: { onOpenQuickProcess: (id: string) => void }) => (
    <button type="button" onClick={() => onOpenQuickProcess('sales-product-1')}>AI 작업 선택</button>
  ),
}));

function openCoupangConfirmation() {
  render(<SourcingPage />);
  fireEvent.click(screen.getByRole('button', { name: 'AI 작업 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '쿠팡 WING 확인 창 열기' }));
}

/**
 * 수집상품 화면의 몰 등록(KID-321). 쿠팡 WING 도 몰 하나다 — 확인 창이 필요한 몰은 공통 확인 창을 열고,
 * 등록 실행은 등록 마법사와 같은 등록 실행 훅(`useMallPublishRun`)을, 폼 채우기는 빠른 등록 훅을 지난다.
 * 지운 WING 전용 준비 · 확정 경로는 없다.
 */
describe('SourcingPage 몰 등록', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runMallsMock.mockResolvedValue(undefined);
  });

  it('opens the shared confirmation dialog for a mall that asks for one, instead of sending right away', () => {
    openCoupangConfirmation();

    expect(screen.getByRole('dialog', { name: 'coupang 확인 창' })).toBeInTheDocument();
    expect(runMallsMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('runs the fenced registration through the shared run with the chosen account, mall values and Sellpia pick', async () => {
    startMock.mockResolvedValue([{
      id: 'coupang#0', mallKey: 'coupang', mallName: '쿠팡 WING', channelAccountId: 'account-1', items: [ITEM],
      values: VALUES, adapterValues: {}, status: 'succeeded',
      outcome: { ok: true, confirmed: false, submitted: true, accepted: true, productNo: '427011919', manualSteps: [], warnings: [] },
      error: null,
    }]);
    openCoupangConfirmation();

    fireEvent.click(screen.getByRole('button', { name: '확인 창 등록 실행' }));

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(1));
    expect(startMock).toHaveBeenCalledWith([expect.objectContaining({
      mallKey: 'coupang',
      channelAccountId: 'account-1',
      items: [ITEM],
      values: VALUES,
      adapterValues: { sellpiaInventorySkuId: 'sku-1', sellpiaQuantity: '1' },
    })]);
    expect(fillConfirmedMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
      '쿠팡 WING에 등록했어요 — 등록상품에 올렸습니다',
      expect.anything(),
    ));
    expect(pushMock).toHaveBeenCalledWith('/product-pipeline/registered-products');
  });

  it('keeps an unconfirmed run on screen as needing confirmation, without moving to registered products', async () => {
    startMock.mockResolvedValue([{
      id: 'coupang#0', mallKey: 'coupang', mallName: '쿠팡 WING', channelAccountId: 'account-1', items: [ITEM],
      values: VALUES, adapterValues: {}, status: 'reconciling',
      outcome: { ok: false, confirmed: false, submitted: true, accepted: null, manualSteps: [], warnings: [], error: '완료 안내를 확인하지 못했습니다.' },
      error: null,
    }]);
    openCoupangConfirmation();

    fireEvent.click(screen.getByRole('button', { name: '확인 창 등록 실행' }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith(
      '쿠팡 WING에 보냈지만 등록 확인이 남았어요',
      expect.objectContaining({ description: expect.stringContaining('완료 안내를 확인하지 못했습니다.') }),
    ));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('re-reads the registration state and the list after a run that opened the fence (KID-320)', async () => {
    startMock.mockResolvedValue([{
      id: 'coupang#0', mallKey: 'coupang', mallName: '쿠팡 WING', channelAccountId: 'account-1', items: [ITEM],
      values: VALUES, adapterValues: {}, status: 'reconciling',
      outcome: { ok: false, confirmed: false, submitted: true, accepted: null, manualSteps: [], warnings: [], error: '확인 필요' },
      error: null,
    }]);
    openCoupangConfirmation();

    fireEvent.click(screen.getByRole('button', { name: '확인 창 등록 실행' }));

    await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith({
      queryKey: ['sales-products', 'registration-state', 'sales-product-1'],
    }));
    expect(invalidateMock).toHaveBeenCalledWith({ queryKey: ['sales-products', 'list'] });
  });

  it('fills the form only through the quick-register hook when registration is not asked for', async () => {
    fillConfirmedMock.mockResolvedValue({ mallKey: 'coupang', status: 'filled' });
    openCoupangConfirmation();

    fireEvent.click(screen.getByRole('button', { name: '확인 창 폼 채우기' }));

    await waitFor(() => expect(fillConfirmedMock).toHaveBeenCalledWith('coupang', { values: VALUES, channelAccount: ACCOUNT }));
    expect(startMock).not.toHaveBeenCalled();
  });

  it('fills the other selected malls first, then opens the confirmation dialog', async () => {
    render(<SourcingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'AI 작업 선택' }));
    fireEvent.click(screen.getByRole('button', { name: /선택한 2개 몰 폼 채우기/ }));

    await waitFor(() => expect(runMallsMock).toHaveBeenCalledWith(['kidsnote']));
    expect(await screen.findByRole('dialog', { name: 'coupang 확인 창' })).toBeInTheDocument();
  });
});
