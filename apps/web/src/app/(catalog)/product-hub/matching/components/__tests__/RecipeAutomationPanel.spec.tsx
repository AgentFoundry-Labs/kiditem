import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
          variants: 2245,
          affectedOptions: 2245,
          autoApply: 129,
          operatorReview: 161,
          blocked: 1955,
          alreadyConfigured: 0,
        },
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

  it('previews deterministic counts and requires an explicit Radix confirmation', async () => {
    const user = userEvent.setup();
    render(<RecipeAutomationPanel channelAccountId={ACCOUNT_ID} />);

    expect(screen.getByText('자동 적용 가능 129')).toBeInTheDocument();
    expect(screen.getByText('수량·상품 검토 161')).toBeInTheDocument();
    expect(screen.getByText('매칭 정보 없음 1,955')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '확정 기준 자동 매칭' }));
    expect(screen.getByText(/기존 레시피는 덮어쓰지 않으며/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '129개 운영 옵션 적용' }));
    expect(apply).toHaveBeenCalledWith({
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
    });
  });

  it('disables application when no variant is auto-eligible', () => {
    vi.mocked(useChannelRecipeAutomationPreview).mockReturnValue({
      data: {
        channelAccountId: ACCOUNT_ID,
        proposalVersion: 'a'.repeat(64),
        generatedAt: '2026-07-18T00:00:00.000Z',
        summary: { variants: 1, affectedOptions: 1, autoApply: 0, operatorReview: 0, blocked: 1, alreadyConfigured: 0 },
        items: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useChannelRecipeAutomationPreview>);

    render(<RecipeAutomationPanel channelAccountId={ACCOUNT_ID} />);
    expect(screen.getByRole('button', { name: '확정 기준 자동 매칭' })).toBeDisabled();
  });
});
