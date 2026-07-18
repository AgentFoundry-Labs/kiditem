import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyChannelRecipeAutomation,
  getChannelRecipeAutomationPreview,
} from '@/lib/channel-recipe-automation-api';
import { RocketDeterministicMatchingPanel } from './RocketDeterministicMatchingPanel';

vi.mock('@/lib/channel-recipe-automation-api', () => ({
  applyChannelRecipeAutomation: vi.fn(),
  getChannelRecipeAutomationPreview: vi.fn(),
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const onApplied = vi.fn();

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RocketDeterministicMatchingPanel
        channelAccountId={ACCOUNT_ID}
        onApplied={onApplied}
      />
    </QueryClientProvider>,
  );
}

describe('<RocketDeterministicMatchingPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getChannelRecipeAutomationPreview).mockResolvedValue({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        variants: 20,
        affectedOptions: 20,
        autoApply: 12,
        operatorReview: 3,
        blocked: 4,
        alreadyConfigured: 1,
      },
      items: [],
    });
    vi.mocked(applyChannelRecipeAutomation).mockResolvedValue({
      proposalVersion: 'a'.repeat(64),
      appliedVariants: 12,
      affectedOptions: 12,
      skippedExistingVariants: 0,
    });
    onApplied.mockResolvedValue(undefined);
  });

  it('previews deterministic decisions but applies only after explicit confirmation', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('자동 적용 가능 12')).toBeInTheDocument();
    expect(screen.getByText('운영자 검토 3')).toBeInTheDocument();
    expect(applyChannelRecipeAutomation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '확정 기준 매칭 적용' }));
    await user.click(screen.getByRole('button', { name: '12개 구성 적용' }));

    expect(vi.mocked(applyChannelRecipeAutomation).mock.calls[0]?.[0]).toEqual({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('keeps unresolved items in the Product Hub review path', async () => {
    renderPanel();

    expect(await screen.findByRole('link', { name: '검토 대상 확인' }))
      .toHaveAttribute('href', '/product-hub/matching?level=options');
  });
});
