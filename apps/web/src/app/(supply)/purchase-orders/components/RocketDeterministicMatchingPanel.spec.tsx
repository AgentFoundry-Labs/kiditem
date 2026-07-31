import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

function group(
  channelListingId: string,
  decision: 'auto_apply' | 'quantity_review' | 'operator_review' | 'blocked' | 'already_configured',
) {
  const variantId = '22222222-2222-4222-8222-222222222222';
  return {
    channelListingId,
    masterProductId: null,
    channelListingOptionIds: ['33333333-3333-4333-8333-333333333333'],
    productVariantIds: decision === 'blocked' ? [] : [variantId],
    decision,
    autoApplyProductVariantIds: decision === 'auto_apply' ? [variantId] : [],
  };
}

function renderPanel(latestAutomation?: {
  evaluatedProducts: number;
  appliedProducts: number;
  appliedVariants: number;
  affectedOptions: number;
  quantityReviewProducts: number;
  operatorReviewProducts: number;
  blockedProducts: number;
  alreadyConfiguredProducts: number;
  skippedExistingVariants: number;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RocketDeterministicMatchingPanel
        channelAccountId={ACCOUNT_ID}
        latestAutomation={latestAutomation}
      />
    </QueryClientProvider>,
  );
}

const AUTOMATION_RESULT = {
  evaluatedProducts: 4,
  appliedProducts: 1,
  appliedVariants: 2,
  affectedOptions: 2,
  quantityReviewProducts: 1,
  operatorReviewProducts: 1,
  blockedProducts: 1,
  alreadyConfiguredProducts: 1,
  skippedExistingVariants: 0,
};

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
        quantityReviewProducts: 1,
        operatorReviewProducts: 1,
        blockedProducts: 1,
        alreadyConfiguredProducts: 1,
        variants: 20,
        affectedOptions: 20,
        autoApply: 12,
        quantityReview: 1,
        operatorReview: 3,
        blocked: 4,
        alreadyConfigured: 1,
      },
      productGroups: [
        group('11111111-1111-4111-8111-111111111101', 'auto_apply'),
        group('11111111-1111-4111-8111-111111111102', 'quantity_review'),
        group('11111111-1111-4111-8111-111111111103', 'operator_review'),
        group('11111111-1111-4111-8111-111111111104', 'blocked'),
        group('11111111-1111-4111-8111-111111111105', 'already_configured'),
      ],
      items: [],
    });
  });

  it('shows product-level decisions without owning a matching mutation', async () => {
    renderPanel();

    expect(await screen.findByRole('link', { name: '매칭 완료 2' })).toHaveAttribute(
      'href',
      `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&status=matched`,
    );
    expect(applyChannelRecipeAutomation).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /매칭 적용/ })).not.toBeInTheDocument();
  });

  it('routes each unresolved status to the selected account product queue', async () => {
    renderPanel();

    expect(await screen.findByRole('link', { name: '매칭 수량 검토 1' }))
      .toHaveAttribute('href', `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&status=quantity_review`);
    expect(screen.getByRole('link', { name: '미매칭 상품 2' }))
      .toHaveAttribute('href', `/product-hub/matching?channelAccountId=${ACCOUNT_ID}&status=unmatched`);
  });

  it('shows what the current Rocket collection automatically applied before capacity preview', async () => {
    renderPanel(AUTOMATION_RESULT);

    expect(await screen.findByText('매칭 완료 1개 · 매칭 수량 검토 1개')).toBeInTheDocument();
    expect(screen.getByText('미매칭 상품 2개')).toBeInTheDocument();
  });

  it('refreshes account-wide matching totals after a later collection changes recipes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <RocketDeterministicMatchingPanel
          channelAccountId={ACCOUNT_ID}
          latestAutomation={AUTOMATION_RESULT}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(getChannelRecipeAutomationPreview).toHaveBeenCalledTimes(1));

    view.rerender(
      <QueryClientProvider client={client}>
        <RocketDeterministicMatchingPanel
          channelAccountId={ACCOUNT_ID}
          latestAutomation={{ ...AUTOMATION_RESULT, appliedProducts: 2 }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getChannelRecipeAutomationPreview).toHaveBeenCalledTimes(2));
  });
});
