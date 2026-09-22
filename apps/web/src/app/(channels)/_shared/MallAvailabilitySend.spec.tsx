import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mallPublishingApi } from './mall-publishing-api';
import { executeListingAvailability } from './listing-availability-execution';
import { sendMallAvailability } from './mall-availability-send';
import { MallAvailabilitySend } from './MallAvailabilitySend';
import type { ListingAvailabilityExecution, ListingAvailabilitySnapshot } from '@kiditem/shared/sales-product';
import type { MallAvailabilityCandidate, MallAvailabilityPreview } from '@kiditem/shared/mall-publishing';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  execute: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('./mall-publishing-api', () => ({ mallPublishingApi: { availabilityPreview: vi.fn() } }));
vi.mock('./mall-availability-send', () => ({
  MALL_AVAILABILITY_NO_ROUTE: '경로 없음',
  MALL_AVAILABILITY_PENDING: {},
  canSendMallAvailability: (mallKey: string) => mallKey === 'coupang',
  sendMallAvailability: mocks.send,
  translateMallAvailabilityWarning: (warning: string) => warning,
}));
vi.mock('./listing-availability-execution', () => ({ executeListingAvailability: mocks.execute }));
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error } }));
vi.mock('./ListingAvailabilityExecutionHistory', () => ({
  ListingAvailabilityConfirmationForm: ({ execution }: { execution: ListingAvailabilityExecution }) => (
    <div data-testid="manual-confirmation">{execution.executionId}</div>
  ),
}));

const ACCOUNT_ONE = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_TWO = '33333333-3333-4333-8333-333333333333';
const LISTING_ID = 'SAME-LISTING-CODE';
const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const LEASE_TOKEN = '77777777-7777-4777-8777-777777777777';

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

function execution(channelAccountId: string): ListingAvailabilityExecution {
  return {
    executionId: EXECUTION_ID,
    channelAccountId,
    status: 'reconciling',
    providerOutcome: 'uncertain',
    payloadHash: 'frozen-hash',
    payload: {
      subject: 'channel_listing',
      channelListingId: '55555555-5555-4555-8555-555555555555',
      channelAccountId,
      mallKey: 'coupang',
      externalListingId: LISTING_ID,
      kind: 'sold_out',
      optionCodes: ['FROZEN-OPTION'],
    },
    leaseToken: LEASE_TOKEN,
    maySubmit: false,
    externalListingId: LISTING_ID,
    expectedProviderAccountId: null,
    result: null,
  } as ListingAvailabilityExecution;
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
    mocks.send.mockResolvedValue({ sent: 1, failed: 0, requestOnly: false, confirmed: 1, warnings: [] });
    mocks.execute.mockImplementation(async (input: {
      channelAccountId: string;
      externalListingId: string;
      kind: 'sold_out' | 'resume';
      optionCodes?: string[];
      send: (snapshot: ListingAvailabilitySnapshot, context: { executionId: string; payloadHash: string; leaseToken: string }) => Promise<unknown>;
    }) => {
      const snapshot: ListingAvailabilitySnapshot = {
        subject: 'channel_listing',
        channelListingId: '55555555-5555-4555-8555-555555555555',
        channelAccountId: input.channelAccountId,
        mallKey: 'coupang',
        externalListingId: input.externalListingId,
        kind: input.kind,
        optionCodes: ['VENDOR-ITEM-A', 'VENDOR-ITEM-B'],
      };
      const transportResult = await input.send(snapshot, { executionId: EXECUTION_ID, payloadHash: 'frozen-hash', leaseToken: LEASE_TOKEN });
      return {
        execution: execution(input.channelAccountId),
        transportResult,
        adapterCalled: true,
        activeReused: false,
        transportError: null,
      };
    });
  });

  it('groups candidates by exact channel account, keeps option-level codes, and exposes per-listing confirmation', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MallAvailabilitySend />
      </QueryClientProvider>,
    );

    const storeA = await screen.findByRole('button', { name: /쿠팡 · 스토어 A.*1건/ });
    expect(screen.getByRole('button', { name: /쿠팡 · 스토어 B.*1건/ })).toBeInTheDocument();
    fireEvent.click(storeA);

    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ONE,
      externalListingId: LISTING_ID,
      kind: 'sold_out',
      optionCodes: ['VENDOR-ITEM-A', 'VENDOR-ITEM-B'],
    }));
    expect(sendMallAvailability).toHaveBeenCalledWith('coupang', [LISTING_ID], {
      resume: false,
      optionCodes: { [LISTING_ID]: ['VENDOR-ITEM-A', 'VENDOR-ITEM-B'] },
      executionContext: { executionId: EXECUTION_ID, payloadHash: 'frozen-hash', leaseToken: LEASE_TOKEN },
    });
    expect(await screen.findByTestId('manual-confirmation')).toHaveTextContent(EXECUTION_ID);
    expect(mocks.warning).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      description: expect.stringContaining('실제 상태를 확인해야'),
    }));
  });
});
