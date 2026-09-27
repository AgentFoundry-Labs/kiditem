import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mallPublishingApi } from './mall-publishing-api';
import { sendMallAvailability } from './mall-availability-send';
import { describeRegistrationOperation } from './registration-operation';
import { MallAvailabilitySend } from './MallAvailabilitySend';
import type { MallAvailabilityCandidate, MallAvailabilityPreview } from '@kiditem/shared/mall-publishing';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./mall-publishing-api', () => ({ mallPublishingApi: { availabilityPreview: vi.fn() } }));
vi.mock('./mall-availability-send', () => ({
  MALL_AVAILABILITY_BATCH_MAX: 500,
  MALL_AVAILABILITY_NO_ROUTE: '경로 없음',
  MALL_AVAILABILITY_PENDING: {},
  canSendMallAvailability: (mallKey: string) => mallKey === 'coupang',
  sendMallAvailability: mocks.send,
  translateMallAvailabilityWarning: (warning: string) => warning,
}));
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error, success: vi.fn() } }));

const ACCOUNT_ONE = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_TWO = '33333333-3333-4333-8333-333333333333';
const LISTING_ID = 'SAME-LISTING-CODE';
const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';

function candidate(overrides: Partial<MallAvailabilityCandidate> = {}): MallAvailabilityCandidate {
  return {
    channelListingOptionId: '44444444-4444-4444-8444-444444444444',
    channelAccountId: ACCOUNT_ONE,
    mallKey: 'coupang',
    mallName: '쿠팡',
    channelAccountName: '스토어 A',
    productName: '동물 블록',
    optionName: '파랑',
    sellerSku: 'SKU-A',
    mallProductCode: LISTING_ID,
    mallOptionCode: 'VENDOR-ITEM-A',
    sellableStock: 0,
    bottleneckCodes: ['BOTTLENECK-A'],
    desiredState: 'sold_out',
    sendable: true,
    effectiveState: 'sold_out',
    blockedReason: null,
    ...overrides,
  };
}

const preview: MallAvailabilityPreview = {
  candidates: [
    candidate(),
    candidate({ channelListingOptionId: '88888888-8888-4888-8888-888888888888', mallOptionCode: 'VENDOR-ITEM-B', optionName: '노랑' }),
    candidate({ channelAccountId: ACCOUNT_TWO, channelAccountName: '스토어 B', mallOptionCode: 'VENDOR-ITEM-C' }),
  ],
  total: 3,
  loaded: 3,
  sendableCount: 3,
  blockedCount: 0,
  noRecipeCount: 0,
};

describe('<MallAvailabilitySend />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mallPublishingApi.availabilityPreview).mockResolvedValue(preview);
    mocks.send.mockResolvedValue({
      started: true,
      message: null,
      operation: describeRegistrationOperation({
        id: EXECUTION_ID, kind: 'channels.registration', status: 'reconciling', lockKeys: [], plan: { executionKind: 'sold_out' }, progress: null,
        result: null, window: null, errorCode: null, errorMessage: null, startedAt: '2026-09-27T09:00:00.000Z',
        finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z', attempts: 1, maxAttempts: 1, scheduledFor: null,
      }),
    });
  });

  it('⭐ groups candidates by exact channel account and sends one account batch of option ids — an unconfirmed batch can be closed', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MallAvailabilitySend />
      </QueryClientProvider>,
    );

    const storeA = await screen.findByRole('button', { name: /쿠팡 · 스토어 A.*1건/ });
    expect(screen.getByRole('button', { name: /쿠팡 · 스토어 B.*1건/ })).toBeInTheDocument();
    fireEvent.click(storeA);

    await waitFor(() => expect(sendMallAvailability).toHaveBeenCalledOnce());
    expect(sendMallAvailability).toHaveBeenCalledWith({
      mallKey: 'coupang',
      channelAccountId: ACCOUNT_ONE,
      action: 'sold_out',
      items: [{ channelListingOptionIds: ['44444444-4444-4444-8444-444444444444', '88888888-8888-4888-8888-888888888888'] }],
    });
    expect(await screen.findByRole('button', { name: '반영되지 않음' })).toBeInTheDocument();
    expect(screen.queryByLabelText('등록상품ID')).toBeNull();
    expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0);
    expect(mocks.warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      description: expect.stringContaining('몰에서 확인한 것만'),
    }));
  });

  it('옵션이 200개를 넘는 몰 상품은 항목당 200개씩 나눠 담는다(계약 상한)', async () => {
    const many = Array.from({ length: 201 }, (_, index) => candidate({
      channelListingOptionId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      mallOptionCode: `V-${index}`,
    }));
    vi.mocked(mallPublishingApi.availabilityPreview).mockResolvedValue({ ...preview, candidates: many, total: 201, loaded: 201 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MallAvailabilitySend />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /쿠팡 · 스토어 A/ }));
    await waitFor(() => expect(sendMallAvailability).toHaveBeenCalledOnce());
    const items = vi.mocked(sendMallAvailability).mock.calls[0]![0].items as Array<{ channelListingOptionIds: string[] }>;
    expect(items.map((item) => item.channelListingOptionIds.length)).toEqual([200, 1]);
  });

  it('a start refusal is shown in the operator’s words, never the raw error', async () => {
    mocks.send.mockRejectedValue(new Error('OPERATION_RUNTIME_MISSING'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MallAvailabilitySend />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /쿠팡 · 스토어 A.*1건/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('품절 실행을 시작하지 못했습니다.');
  });
});
