import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listingAvailabilityExecutionApi } from './listing-availability-execution-api';
import { ListingAvailabilityConfirmationForm } from './ListingAvailabilityExecutionHistory';
import type { ListingAvailabilityExecution } from '@kiditem/shared/sales-product';

vi.mock('./listing-availability-execution-api', () => ({
  listingAvailabilityExecutionKeys: {
    history: (accountId: string, listingId: string) => ['listing-availability-executions', accountId, listingId],
  },
  listingAvailabilityExecutionApi: { report: vi.fn() },
}));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const LEASE_TOKEN = '77777777-7777-4777-8777-777777777777';

function execution(overrides: Partial<ListingAvailabilityExecution> = {}): ListingAvailabilityExecution {
  return {
    executionId: EXECUTION_ID,
    channelAccountId: ACCOUNT_ID,
    status: 'reconciling',
    providerOutcome: 'uncertain',
    payloadHash: 'frozen-hash',
    payload: {
      subject: 'channel_listing',
      channelListingId: '55555555-5555-4555-8555-555555555555',
      channelAccountId: ACCOUNT_ID,
      mallKey: 'coupang',
      externalListingId: 'MALL-OBSERVED',
      kind: 'sold_out',
      optionCodes: ['OPT-1'],
    },
    leaseToken: LEASE_TOKEN,
    maySubmit: false,
    externalListingId: 'MALL-OBSERVED',
    expectedProviderAccountId: null,
    result: null,
    ...overrides,
  } as ListingAvailabilityExecution;
}

function renderForm(value: ListingAvailabilityExecution) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ListingAvailabilityConfirmationForm execution={value} />
    </QueryClientProvider>,
  );
}

function fillListingEvidence() {
  fireEvent.change(screen.getByLabelText('실제 몰 상품번호'), { target: { value: 'MALL-OBSERVED' } });
  fireEvent.change(screen.getByLabelText('실제 몰 관리자 상품 URL'), {
    target: { value: 'https://admin.example.test/products/MALL-OBSERVED' },
  });
}

function openConfirmation() {
  fireEvent.click(screen.getByText('실제 몰 결과 확인 기록 · 재전송하지 않음'));
}

describe('<ListingAvailabilityConfirmationForm />', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows an optional observed account when the frozen account is unknown', async () => {
    const current = execution();
    vi.mocked(listingAvailabilityExecutionApi.report).mockResolvedValue(current);
    renderForm(current);
    openConfirmation();
    fillListingEvidence();
    fireEvent.click(screen.getByRole('button', { name: '실제 몰 확인 기록' }));

    await waitFor(() => expect(listingAvailabilityExecutionApi.report).toHaveBeenCalledOnce());
    expect(listingAvailabilityExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      outcome: 'confirmed',
      evidence: expect.not.objectContaining({ providerAccountId: expect.anything() }),
    }));
  });

  it('blocks confirmation when the operator enters a different marketplace listing ID', async () => {
    const base = execution();
    const current = execution({
      payload: { ...base.payload, externalListingId: 'FROZEN-LISTING' },
      externalListingId: 'FROZEN-LISTING',
    });
    renderForm(current);
    openConfirmation();
    fillListingEvidence();
    fireEvent.click(screen.getByRole('button', { name: '실제 몰 확인 기록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('동결된 상품과 일치하지 않습니다');
    expect(listingAvailabilityExecutionApi.report).not.toHaveBeenCalled();
  });

  it('requires the operator-entered account to match the frozen account before reporting', async () => {
    const current = execution({ expectedProviderAccountId: 'seller-expected' });
    vi.mocked(listingAvailabilityExecutionApi.report).mockResolvedValue(current);
    renderForm(current);
    openConfirmation();
    fillListingEvidence();

    fireEvent.click(screen.getByRole('button', { name: '실제 몰 확인 기록' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('실제 몰 계정 식별자');
    expect(listingAvailabilityExecutionApi.report).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('실제 몰 계정 식별자'), { target: { value: 'seller-wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '실제 몰 확인 기록' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('일치하지 않습니다');
    expect(listingAvailabilityExecutionApi.report).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('실제 몰 계정 식별자'), { target: { value: 'seller-expected' } });
    fireEvent.click(screen.getByRole('button', { name: '실제 몰 확인 기록' }));
    await waitFor(() => expect(listingAvailabilityExecutionApi.report).toHaveBeenCalledOnce());
    expect(listingAvailabilityExecutionApi.report).toHaveBeenCalledWith(EXECUTION_ID, expect.objectContaining({
      leaseToken: LEASE_TOKEN,
      payloadHash: 'frozen-hash',
      outcome: 'confirmed',
      evidence: {
        channelAccountId: ACCOUNT_ID,
        externalListingId: 'MALL-OBSERVED',
        observedUrl: 'https://admin.example.test/products/MALL-OBSERVED',
        providerAccountId: 'seller-expected',
      },
    }));
  });
});
