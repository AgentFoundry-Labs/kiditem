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

function localCalendarDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RocketPurchasePreviewSection />
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

  it('remounts account-scoped workspace state when the Rocket account changes', async () => {
    const user = userEvent.setup();
    renderSection();
    const selector = await screen.findByRole('combobox', { name: '로켓 채널 계정' });
    const startDate = screen.getByLabelText('조회 시작일');
    await user.clear(startDate);
    await user.type(startDate, '2026-01-01');

    await user.selectOptions(selector, secondRocketAccountId);

    await waitFor(() => expect(screen.getByLabelText('조회 시작일'))
      .toHaveValue(localCalendarDay(new Date())));
    expect(selector).toHaveValue(secondRocketAccountId);
  });
});
