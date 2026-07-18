import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
} from '@kiditem/shared/channel-product-matching';
import type {
  ChannelRecipeAutomationItem,
  ChannelRecipeAutomationProductGroup,
} from '@kiditem/shared/channel-recipe-automation';
import { ProductInventoryMatchingTable } from '../ProductInventoryMatchingTable';

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const VARIANT_ID = '33333333-3333-4333-8333-333333333333';
const OPTION_A = '44444444-4444-4444-8444-444444444444';
const OPTION_B = '55555555-5555-4555-8555-555555555555';

describe('<ProductInventoryMatchingTable>', () => {
  it('shows one product status row and reveals child actions only after product expansion', async () => {
    const user = userEvent.setup();
    const onEditProduct = vi.fn();
    const onEditVariant = vi.fn();
    const onShowRecipeSuggestion = vi.fn();
    render(
      <ProductInventoryMatchingTable
        products={[product()]}
        options={[
          option(OPTION_A, '블루', VARIANT_ID),
          option(OPTION_B, '핑크', null),
        ]}
        productGroups={[group()]}
        automationItemsByOptionId={new Map([[OPTION_A, automationItem()]])}
        onEditProduct={onEditProduct}
        onEditVariant={onEditVariant}
        onShowRecipeSuggestion={onShowRecipeSuggestion}
      />,
    );

    expect(screen.getByText('채널 우산')).toBeInTheDocument();
    expect(screen.getByText('옵션 2개')).toBeInTheDocument();
    expect(screen.getByText('운영자 검토')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '운영 상품 연결' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '운영 옵션 연결' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '상품별 확인' }));

    expect(screen.getByText('블루')).toBeInTheDocument();
    expect(screen.getByText('핑크')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '운영 상품 연결' }));
    expect(onEditProduct).toHaveBeenCalledWith(expect.objectContaining({
      listing: expect.objectContaining({ id: LISTING_ID }),
    }));
    expect(screen.getAllByRole('button', { name: '운영 옵션 연결' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Sellpia 후보' }));
    expect(onShowRecipeSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      option: expect.objectContaining({ id: OPTION_A }),
    }));
  });

  it('shows the inferred component quantity for an automatic name match', async () => {
    const user = userEvent.setup();
    render(
      <ProductInventoryMatchingTable
        products={[product()]}
        options={[option(OPTION_A, '블루', VARIANT_ID)]}
        productGroups={[{ ...group(), decision: 'auto_apply', autoApplyProductVariantIds: [VARIANT_ID] }]}
        automationItemsByOptionId={new Map([[OPTION_A, {
          ...automationItem(),
          decision: 'auto_apply',
          reason: 'high_confidence_name',
          recommendedQuantity: 2,
        }]])}
        onEditProduct={vi.fn()}
        onEditVariant={vi.fn()}
        onShowRecipeSuggestion={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '상품별 확인' }));
    expect(screen.getByText('자동 매칭 가능 · 고신뢰 상품명 일치 · 수량 2')).toBeInTheDocument();
  });
});

function product(): ChannelProductMatchingQueueRow {
  return {
    channelAccount: {
      id: '66666666-6666-4666-8666-666666666666',
      channel: 'rocket',
      name: 'Coupang Rocket',
    },
    listing: {
      id: LISTING_ID,
      externalId: 'rocket-product-1',
      displayName: '채널 우산',
      status: 'active',
      masterProductId: PRODUCT_ID,
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    linkedProduct: { id: PRODUCT_ID, code: 'KI-1', name: '키즈 우산' },
    optionCount: 2,
    linkedOptionCount: 1,
  };
}

function option(
  id: string,
  itemName: string,
  productVariantId: string | null,
): ChannelOptionMatchingQueueRow {
  const linkedVariant = productVariantId ? {
    id: productVariantId,
    masterProductId: PRODUCT_ID,
    code: 'KI-1-BLUE',
    name: itemName,
    optionLabel: `색상: ${itemName}`,
  } : null;
  return {
    channelAccount: product().channelAccount,
    listing: {
      id: LISTING_ID,
      externalId: 'rocket-product-1',
      masterProductId: PRODUCT_ID,
    },
    option: {
      id,
      externalOptionId: `rocket-${id}`,
      itemName,
      sellerSku: productVariantId ? 'SP-001' : null,
      barcode: null,
      productVariantId,
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    linkedVariant,
    recipeStatus: productVariantId ? 'configuration_required' : 'unmatched',
    capacity: null,
  };
}

function group(): ChannelRecipeAutomationProductGroup {
  return {
    channelListingId: LISTING_ID,
    masterProductId: PRODUCT_ID,
    channelListingOptionIds: [OPTION_A, OPTION_B],
    productVariantIds: [VARIANT_ID],
    decision: 'operator_review',
    autoApplyProductVariantIds: [],
  };
}

function automationItem(): ChannelRecipeAutomationItem {
  return {
    productVariantId: VARIANT_ID,
    masterProductId: PRODUCT_ID,
    channelListingOptionIds: [OPTION_A],
    decision: 'operator_review',
    reason: 'quantity_review',
    sellpiaInventorySkuId: '77777777-7777-4777-8777-777777777777',
    sellpiaCode: 'SP-001',
    recommendedQuantity: null,
    evidenceLabels: ['seller_sku_code: SP-001'],
  };
}
