import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeListingAvailability } from '../../_shared/listing-availability-execution';
import { sendMallAvailability } from '../../_shared/mall-availability-send';
import { CellActionPopover } from './ListingActionMenus';
import type { MallListingMatrixColumn } from '@kiditem/shared/mall-publishing';
import type { ListingAvailabilityExecution, ListingAvailabilitySnapshot } from '@kiditem/shared/sales-product';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  execute: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../_shared/listing-availability-execution', () => ({ executeListingAvailability: mocks.execute }));
vi.mock('../../_shared/mall-availability-send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../_shared/mall-availability-send')>()),
  canReadMallAvailability: () => false,
  sendMallAvailability: mocks.send,
}));
vi.mock('../../_shared/ListingAvailabilityExecutionHistory', () => ({
  ListingAvailabilityExecutionHistory: () => null,
}));
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error } }));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const LEASE_TOKEN = '77777777-7777-4777-8777-777777777777';
const LISTING_ID = 'FROZEN-LISTING';

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
      kind: 'resume',
      optionCodes: ['FROZEN-OPTION'],
    },
    leaseToken: LEASE_TOKEN,
    maySubmit: false,
    externalListingId: LISTING_ID,
    expectedProviderAccountId: null,
    result: null,
  } as ListingAvailabilityExecution;
}

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

describe('<CellActionPopover /> availability action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ sent: 1, failed: 0, requestOnly: false, confirmed: 1, warnings: [] });
    mocks.execute.mockImplementation(async (input: {
      channelAccountId: string;
      externalListingId: string;
      mallKey: string;
      kind: 'sold_out' | 'resume';
      send: (snapshot: ListingAvailabilitySnapshot, context: { executionId: string; payloadHash: string; leaseToken: string }) => Promise<unknown>;
    }) => {
      const snapshot: ListingAvailabilitySnapshot = {
        subject: 'channel_listing',
        channelListingId: '55555555-5555-4555-8555-555555555555',
        channelAccountId: input.channelAccountId,
        mallKey: input.mallKey,
        externalListingId: LISTING_ID,
        kind: input.kind,
        optionCodes: ['FROZEN-OPTION'],
      };
      const transportResult = await input.send(snapshot, {
        executionId: EXECUTION_ID,
        payloadHash: 'frozen-hash',
        leaseToken: LEASE_TOKEN,
      });
      return {
        execution: execution(input.channelAccountId),
        transportResult,
        adapterCalled: true,
        activeReused: false,
        transportError: null,
      };
    });
  });

  it('keeps the per-cell show behavior and routes the frozen listing/account through the execution ledger', async () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CellActionPopover
          column={column(ACCOUNT_ID)}
          productName="동물 블록"
          state="published"
          rawStatus="판매중"
          externalId="LIVE-LISTING"
          anchor={anchor}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '판매 재개' }));

    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      externalListingId: 'LIVE-LISTING',
      mallKey: 'coupang',
      kind: 'resume',
    }));
    expect(sendMallAvailability).toHaveBeenCalledWith('coupang', [LISTING_ID], {
      resume: true,
      show: true,
      optionCodes: { [LISTING_ID]: ['FROZEN-OPTION'] },
      executionContext: { executionId: EXECUTION_ID, payloadHash: 'frozen-hash', leaseToken: LEASE_TOKEN },
    });
    expect(mocks.warning.mock.calls[0]?.[0]).toContain('실제 몰 계정과 상태를 확인해 기록하세요');
  });

  it('does not enable an availability send without the exact channel account ID', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CellActionPopover
          column={column(null)}
          productName="동물 블록"
          state="published"
          rawStatus="판매중"
          externalId="LIVE-LISTING"
          anchor={anchor}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: /판매 재개/ })).toBeDisabled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
