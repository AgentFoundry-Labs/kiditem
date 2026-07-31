import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  useChannelRecipeAutomationPreviews,
  useRunChannelProductMatching,
} from '../../hooks/useChannelSkuMappings';
import { RecipeAutomationPanel } from '../RecipeAutomationPanel';

vi.mock('../../hooks/useChannelSkuMappings', () => ({
  useChannelRecipeAutomationPreviews: vi.fn(),
  useRunChannelProductMatching: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const runMatching = vi.fn();

function preview(overrides: Record<string, number> = {}) {
  return {
    data: {
      channelAccountId: ACCOUNT_ID,
      proposalVersion: 'a'.repeat(64),
      generatedAt: '2026-07-18T00:00:00.000Z',
      summary: {
        products: 4,
        autoApplyProducts: 1,
        quantityReviewProducts: 1,
        operatorReviewProducts: 0,
        blockedProducts: 2,
        alreadyConfiguredProducts: 0,
        variants: 8,
        affectedOptions: 8,
        autoApply: 1,
        quantityReview: 1,
        operatorReview: 0,
        blocked: 2,
        alreadyConfigured: 0,
        ...overrides,
      },
      productGroups: [
        productGroup('44444444-4444-4444-8444-444444444441', 'auto_apply'),
        productGroup('44444444-4444-4444-8444-444444444442', 'quantity_review'),
        productGroup('44444444-4444-4444-8444-444444444443', 'blocked'),
        productGroup('44444444-4444-4444-8444-444444444444', 'blocked'),
      ],
      items: [],
    },
    isLoading: false,
    isFetching: false,
    error: null,
  };
}

function productGroup(
  channelListingId: string,
  decision: 'auto_apply' | 'quantity_review' | 'blocked',
) {
  return {
    channelListingId,
    masterProductId: null,
    channelListingOptionIds: ['55555555-5555-4555-8555-555555555555'],
    productVariantIds: [],
    decision,
    autoApplyProductVariantIds: decision === 'auto_apply'
      ? ['66666666-6666-4666-8666-666666666666']
      : [],
  };
}

describe('<RecipeAutomationPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runMatching.mockResolvedValue({
      collectedAliases: 120,
      evaluatedAccounts: 1,
      appliedProducts: 1,
      appliedVariants: 1,
      affectedOptions: 1,
      skippedProducts: 3,
      skippedExistingVariants: 0,
    });
    vi.mocked(useRunChannelProductMatching).mockReturnValue({
      mutateAsync: runMatching,
      isPending: false,
    } as unknown as ReturnType<typeof useRunChannelProductMatching>);
    vi.mocked(useChannelRecipeAutomationPreviews).mockReturnValue([
      preview(),
    ] as unknown as ReturnType<typeof useChannelRecipeAutomationPreviews>);
  });

  it('consolidates matching progress and keeps quantity review separate', () => {
    render(
      <RecipeAutomationPanel
        channelAccountIds={[ACCOUNT_ID]}
      />,
    );

    expect(screen.getByText('매칭 완료')).toBeInTheDocument();
    expect(screen.getByText('매칭 수량 검토')).toBeInTheDocument();
    expect(screen.getByText('미매칭 상품')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('상품 연결과 수량 확정을 분리합니다. 명시된 묶음 수량은 Sellpia 설정 수량과 일치할 때만 자동 확정합니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('선택한 계정의 안전한 대상만 자동 적용합니다.')).not.toBeInTheDocument();
  });

  it('runs Sellpia lookup and safe matching as one user action', async () => {
    const user = userEvent.setup();
    render(
      <RecipeAutomationPanel
        channelAccountIds={[ACCOUNT_ID]}
      />,
    );

    expect(screen.queryByRole('button', { name: '수동매칭 근거 수집' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '안전한 재고 구성 적용' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '상품 매칭 실행' }));
    expect(runMatching).toHaveBeenCalledWith({
      channelAccountIds: [ACCOUNT_ID],
    });
    expect(toast.success).toHaveBeenCalledWith(
      '상품 1개, 운영 옵션 1개에 재고 구성을 적용했습니다.',
    );
  });

  it('runs the single matching action across every selected account', async () => {
    const user = userEvent.setup();
    const otherAccountId = '66666666-6666-4666-8666-666666666666';
    render(
      <RecipeAutomationPanel
        channelAccountIds={[
          ACCOUNT_ID,
          otherAccountId,
        ]}
      />,
    );

    const button = screen.getByRole('button', { name: '상품 매칭 실행' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(runMatching).toHaveBeenCalledWith({
      channelAccountIds: [ACCOUNT_ID, otherAccountId],
    });
  });
});
