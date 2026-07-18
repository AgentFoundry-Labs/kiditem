import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RocketDeterministicMatchingPanel
        channelAccountId={ACCOUNT_ID}
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
        products: 5,
        autoApplyProducts: 2,
        operatorReviewProducts: 1,
        blockedProducts: 1,
        alreadyConfiguredProducts: 1,
        variants: 20,
        affectedOptions: 20,
        autoApply: 12,
        operatorReview: 3,
        blocked: 4,
        alreadyConfigured: 1,
      },
      productGroups: [],
      items: [],
    });
  });

  it('shows product-level decisions without owning a matching mutation', async () => {
    renderPanel();

    expect(await screen.findByRole('link', { name: '자동 적용 가능 2' })).toHaveAttribute(
      'href',
      `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&status=auto_apply`,
    );
    expect(applyChannelRecipeAutomation).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /매칭 적용/ })).not.toBeInTheDocument();
  });

  it('routes each unresolved status to the selected account product queue', async () => {
    renderPanel();

    expect(await screen.findByRole('link', { name: '운영자 검토 1' }))
      .toHaveAttribute('href', `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&status=operator_review`);
    expect(screen.getByRole('link', { name: '연결·매칭 필요 1' }))
      .toHaveAttribute('href', `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&status=blocked`);
  });
});
