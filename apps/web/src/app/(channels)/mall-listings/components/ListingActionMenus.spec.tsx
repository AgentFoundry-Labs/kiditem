import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMallAvailability } from '../../_shared/mall-availability-send';
import { describeRegistrationOperation } from '../../_shared/registration-operation';
import { CellActionPopover } from './ListingActionMenus';
import type { MallListingMatrixColumn } from '@kiditem/shared/mall-publishing';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('../../_shared/mall-availability-send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../_shared/mall-availability-send')>()),
  canReadMallAvailability: () => false,
  sendMallAvailability: mocks.send,
}));
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error, success: mocks.success } }));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const LISTING_ID = '55555555-5555-4555-8555-555555555555';
const OPERATION_ID = '66666666-6666-4666-8666-666666666666';

function column(channelAccountId: string | null): MallListingMatrixColumn {
  return {
    mallKey: 'coupang',
    mallName: '쿠팡',
    channelAccountId,
    hasAdapter: true,
    imported: true,
    listingCount: 1,
    actions: {
      createListing: true,
      updateListing: true,
      soldOut: true,
      resume: true,
      setStock: true,
      soldOutDeletesListing: false,
      requiresOperatorApproval: false,
      soldOutRoute: 'mall_admin',
    },
  } as MallListingMatrixColumn;
}

function mount(props: { channelAccountId: string | null; channelListingId: string | null }) {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CellActionPopover
        column={column(props.channelAccountId)}
        productName="동물 블록"
        state="published"
        rawStatus="판매중"
        externalId="LIVE-LISTING"
        channelListingId={props.channelListingId}
        anchor={anchor}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('<CellActionPopover /> availability action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({
      started: true,
      message: null,
      operation: describeRegistrationOperation({
        id: OPERATION_ID, kind: 'channels.registration', status: 'reconciling', lockKeys: [],
        plan: { executionKind: 'resume' }, progress: null, result: null, window: null, errorCode: null, errorMessage: null,
        startedAt: '2026-09-27T09:00:00.000Z', finishedAt: null, expiresAt: '2026-09-27T09:30:00.000Z',
        attempts: 1, maxAttempts: 1, scheduledFor: null,
      }),
    });
  });

  it('⭐ 이 칸의 리스팅 하나로 재개 실행을 시작하고, 몰에서 확인하지 못한 결과를 그 자리에 보인다', async () => {
    mount({ channelAccountId: ACCOUNT_ID, channelListingId: LISTING_ID });

    fireEvent.click(screen.getByRole('button', { name: '판매 재개' }));

    await waitFor(() => expect(sendMallAvailability).toHaveBeenCalledOnce());
    expect(sendMallAvailability).toHaveBeenCalledWith({
      mallKey: 'coupang', channelAccountId: ACCOUNT_ID, action: 'resume', items: [{ channelListingId: LISTING_ID }],
    });
    expect(mocks.warning.mock.calls[0]?.[0]).toContain('몰에서 반영을 확인해 주세요');
    expect(await screen.findByRole('button', { name: '반영되지 않음' })).toBeInTheDocument();
  });

  it('does not enable an availability send without the exact channel account ID', () => {
    mount({ channelAccountId: null, channelListingId: LISTING_ID });
    expect(screen.getByRole('button', { name: /판매 재개/ })).toBeDisabled();
    expect(sendMallAvailability).not.toHaveBeenCalled();
  });

  it('칸의 리스팅 행은 표 리더가 싣는다 — 버튼을 툴팁으로 막지 않고, 행이 없으면 보내지 않고 까닭을 말한다', async () => {
    mount({ channelAccountId: ACCOUNT_ID, channelListingId: null });
    const button = screen.getByRole('button', { name: /판매 재개/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(sendMallAvailability).not.toHaveBeenCalled();
  });
});
