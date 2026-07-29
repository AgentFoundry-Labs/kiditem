import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const freshness = vi.hoisted(() => ({ state: null as unknown }));
const reconcile = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({ state: freshness.state }),
}));
vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({
  sellpiaInventoryFreshnessApi: { reconcileOrderTransmissionIntent: reconcile },
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import UnresolvedTransmissions from './UnresolvedTransmissions';
import { ApiError } from '@/lib/api-error';

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UnresolvedTransmissions />
    </QueryClientProvider>,
  );
}

const BLOCKER = {
  intentKey: '1785076954061-kidsnote-browser',
  preparedAt: '2026-07-26T14:42:38.482Z',
};

describe('UnresolvedTransmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reconcile.mockResolvedValue({});
    freshness.state = { unresolvedOrderTransmissionIntents: [BLOCKER] };
  });

  it('stays invisible while no transmission needs reconciliation', () => {
    freshness.state = { unresolvedOrderTransmissionIntents: [] };
    renderSection();

    expect(screen.queryByText('셀피아 전송 결과 미확인')).not.toBeInTheDocument();
  });

  it('names the unresolved transmission without claiming stock sync is blocked', () => {
    renderSection();

    expect(screen.getByText('셀피아 전송 결과 미확인')).toBeInTheDocument();
    expect(screen.getByText(BLOCKER.intentKey)).toBeInTheDocument();
    expect(screen.getByText(/다른 주문 수집과 재고 동기화는 계속 사용할 수 있습니다/))
      .toBeInTheDocument();
    expect(screen.queryByText(/재고 동기화가 차단됩니다/)).not.toBeInTheDocument();
  });

  // The recovery the order-collection retry gate cannot offer once the local
  // generated file has no transmission marker.
  it('confirms receipt as submitted and finalizes the exact intent', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: '셀피아에 접수됨' }));

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({
      intentKey: BLOCKER.intentKey,
      outcome: 'submitted',
    }));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('records non-receipt so the same file can be resent', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: '미접수 (재전송 필요)' }));

    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'not_submitted' }),
    ));
  });

  it('explains the owner/admin requirement instead of a generic failure', async () => {
    reconcile.mockRejectedValueOnce(new ApiError(403, 'forbidden', 'owner/admin only'));
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: '셀피아에 접수됨' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error.mock.calls[0][0]).toContain('owner/admin');
  });
});
