import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  useApplyChannelRecipeAutomation,
  useChannelRecipeAutomationPreview,
} from '../../hooks/useChannelSkuMappings';
import { RecipeAutomationPanel } from '../RecipeAutomationPanel';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useApplyChannelRecipeAutomation: vi.fn(),
  useChannelRecipeAutomationPreview: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const apply = vi.fn();
const refetch = vi.fn();

describe('<RecipeAutomationPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apply.mockResolvedValue({
      proposalVersion: 'a'.repeat(64),
      appliedProducts: 1,
      skippedProducts: 3,
      appliedVariants: 129,
      affectedOptions: 129,
      skippedExistingVariants: 0,
    });
    vi.mocked(useApplyChannelRecipeAutomation).mockReturnValue({
      mutateAsync: apply,
      isPending: false,
    } as unknown as ReturnType<typeof useApplyChannelRecipeAutomation>);
    vi.mocked(useChannelRecipeAutomationPreview).mockReturnValue({
      data: {
        channelAccountId: ACCOUNT_ID,
        proposalVersion: 'a'.repeat(64),
        generatedAt: '2026-07-18T00:00:00.000Z',
        summary: {
          products: 4,
          autoApplyProducts: 1,
          operatorReviewProducts: 1,
          blockedProducts: 2,
          alreadyConfiguredProducts: 0,
          variants: 2245,
          affectedOptions: 2245,
          autoApply: 129,
          operatorReview: 161,
          blocked: 1955,
          alreadyConfigured: 0,
        },
        productGroups: [{
          channelListingId: '44444444-4444-4444-8444-444444444444',
          masterProductId: '22222222-2222-4222-8222-222222222222',
          channelListingOptionIds: Array.from({ length: 129 }, (_, index) => `option-${index}`),
          productVariantIds: ['11111111-1111-4111-8111-111111111111'],
          decision: 'auto_apply',
          autoApplyProductVariantIds: ['11111111-1111-4111-8111-111111111111'],
        }],
        items: [{
          productVariantId: '11111111-1111-4111-8111-111111111111',
          masterProductId: '22222222-2222-4222-8222-222222222222',
          channelListingOptionIds: Array.from({ length: 129 }, (_, index) => `option-${index}`),
          decision: 'auto_apply',
          reason: 'exact_unique_code',
          sellpiaInventorySkuId: '33333333-3333-4333-8333-333333333333',
          sellpiaCode: 'SP-001',
          recommendedQuantity: 1,
          evidenceLabels: ['seller_sku_code: SP-001'],
        }],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useChannelRecipeAutomationPreview>);
  });

  it('runs the current safe product proposal with one explicit click', async () => {
    const user = userEvent.setup();
    render(<RecipeAutomationPanel channelAccountId={ACCOUNT_ID} />);

    expect(screen.getByText('자동 적용 가능 1')).toBeInTheDocument();
    expect(screen.getByText('운영자 검토 1')).toBeInTheDocument();
    expect(screen.getByText('연결·매칭 필요 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '상품·재고 자동 매칭' }));
    expect(apply).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      '상품 1개, 운영 옵션 129개에 재고 연결을 적용했습니다.',
    );
  });

  it('disables application when no variant is auto-eligible', () => {
    vi.mocked(useChannelRecipeAutomationPreview).mockReturnValue({
      data: {
        channelAccountId: ACCOUNT_ID,
        proposalVersion: 'a'.repeat(64),
        generatedAt: '2026-07-18T00:00:00.000Z',
        summary: {
          products: 1,
          autoApplyProducts: 0,
          operatorReviewProducts: 0,
          blockedProducts: 1,
          alreadyConfiguredProducts: 0,
          variants: 1,
          affectedOptions: 1,
          autoApply: 0,
          operatorReview: 0,
          blocked: 1,
          alreadyConfigured: 0,
        },
        productGroups: [{
          channelListingId: '44444444-4444-4444-8444-444444444444',
          masterProductId: null,
          channelListingOptionIds: ['55555555-5555-4555-8555-555555555555'],
          productVariantIds: [],
          decision: 'blocked',
          autoApplyProductVariantIds: [],
        }],
        items: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useChannelRecipeAutomationPreview>);

    render(<RecipeAutomationPanel channelAccountId={ACCOUNT_ID} />);
    expect(screen.getByRole('button', { name: '상품·재고 자동 매칭' })).toBeDisabled();
  });
});
