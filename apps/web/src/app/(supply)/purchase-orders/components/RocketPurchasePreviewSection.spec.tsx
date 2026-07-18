import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { RocketPurchasePreviewSection } from './RocketPurchasePreviewSection';

vi.mock('@/lib/api-client', () => ({
  apiClient: { getParsed: vi.fn() },
}));

const rocketAccountId = '11111111-1111-4111-8111-111111111111';
const secondRocketAccountId = '33333333-3333-4333-8333-333333333333';

function renderSection({
  from = '2026-07-16',
  to = '2026-07-22',
}: {
  from?: string;
  to?: string;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RocketPurchasePreviewSection from={from} to={to} />
    </QueryClientProvider>,
  );
}

describe('<RocketPurchasePreviewSection>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getParsed).mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        channel: 'coupang',
        name: 'Wing',
        externalAccountId: null,
        vendorId: 'WING',
        sellerId: null,
        isPrimary: true,
      },
      {
        id: rocketAccountId,
        channel: 'rocket',
        name: '로켓 공급사',
        externalAccountId: null,
        vendorId: 'ROCKET',
        sellerId: null,
        isPrimary: false,
      },
      {
        id: secondRocketAccountId,
        channel: 'rocket',
        name: '두 번째 로켓 공급사',
        externalAccountId: null,
        vendorId: 'ROCKET-2',
        sellerId: null,
        isPrimary: false,
      },
    ]);
  });

  it('mounts the confirmation workspace behind an active Rocket account selector', async () => {
    renderSection();

    expect(await screen.findByRole('combobox', { name: '로켓 채널 계정' }))
      .toHaveValue(rocketAccountId);
    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '확정 후 엑셀 다운로드' })).toBeDisabled();
  });

  it('keeps the calendar-owned range while remounting account-scoped workspace state', async () => {
    const user = userEvent.setup();
    renderSection();
    const selector = await screen.findByRole('combobox', { name: '로켓 채널 계정' });

    await user.selectOptions(selector, secondRocketAccountId);

    await waitFor(() => expect(selector).toHaveValue(secondRocketAccountId));
    expect(screen.queryByLabelText('조회 시작일')).not.toBeInTheDocument();
    expect(screen.getByText('2026-07-16 ~ 2026-07-22')).toBeInTheDocument();
  });
});
