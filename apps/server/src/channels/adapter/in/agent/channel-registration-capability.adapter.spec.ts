import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ChannelRegistrationCapabilityAdapter } from './channel-registration-capability.adapter';

describe('ChannelRegistrationCapabilityAdapter', () => {
  it('previews the one automatically verified Sellpia match without calling Coupang', async () => {
    const proposal = {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
      code: '10451-1',
      name: '3500꿀사과슬랑이',
      optionName: null,
      currentStock: 13,
      evidence: [],
      requiresQuantityConfirmation: false,
      recommendedQuantity: 1,
    };
    const marketplace = { findExistingExternalProductRegistration: vi.fn() };
    const recipes = {
      suggestRegistration: vi.fn().mockResolvedValue({
        automationDecision: 'auto_apply',
        recommendedQuantity: 1,
        reason: 'one match',
        proposals: [proposal],
      }),
    };
    const adapter = new ChannelRegistrationCapabilityAdapter(
      marketplace as never,
      recipes as never,
    );

    await expect(adapter.previewExternalProductRegistrationMatch({
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      listingName: '꿀사과슬랑이',
      itemName: null,
    })).resolves.toEqual({
      status: 'matched',
      reason: '상품명으로 셀피아 재고 1건을 자동 매칭했습니다.',
      sellpiaMatch: {
        sellpiaInventorySkuId: proposal.sellpiaInventorySkuId,
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      proposals: [{
        sellpiaInventorySkuId: proposal.sellpiaInventorySkuId,
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        recommendedQuantity: 1,
      }],
    });
    expect(marketplace.findExistingExternalProductRegistration).not.toHaveBeenCalled();
  });

  it('revalidates an operator-selected active Sellpia SKU even when it was not suggested', async () => {
    const selectedSku = {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000099',
      code: 'MANUAL-99',
      name: '직접 선택한 셀피아 상품',
      optionName: '파랑',
      currentStock: 7,
    };
    const marketplace = {
      findExistingExternalProductRegistration: vi.fn().mockResolvedValue(null),
    };
    const recipes = {
      suggestRegistration: vi.fn().mockResolvedValue({
        automationDecision: 'blocked',
        recommendedQuantity: null,
        reason: 'No deterministic Sellpia evidence was found',
        proposals: [],
      }),
      resolveSelectedRegistrationSku: vi.fn().mockResolvedValue(selectedSku),
    };
    const adapter = new ChannelRegistrationCapabilityAdapter(
      marketplace as never,
      recipes as never,
    );

    await expect(adapter.preflightExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      sourceCandidateId: 'candidate-1',
      listingName: '등록할 상품',
      itemName: null,
      selectedSellpiaInventorySkuId: selectedSku.sellpiaInventorySkuId,
      selectedQuantity: 2,
    })).resolves.toEqual({
      sellpiaMatch: { ...selectedSku, quantity: 2 },
      existingListing: null,
    });
    expect(recipes.resolveSelectedRegistrationSku).toHaveBeenCalledWith(
      'org-1',
      selectedSku.sellpiaInventorySkuId,
    );
    expect(marketplace.findExistingExternalProductRegistration).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      externalVendorSku: 'MANUAL-99',
    });
  });

  it('matches one real Sellpia SKU and checks Coupang with that SKU code', async () => {
    const proposal = {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000051',
      code: '10451-1',
      name: '3500꿀사과슬랑이',
      optionName: null,
      currentStock: 13,
      evidence: [],
      requiresQuantityConfirmation: false,
      recommendedQuantity: 1,
    };
    const marketplace = {
      findExistingExternalProductRegistration: vi.fn().mockResolvedValue({
        externalListingId: '427011919',
        displayName: '꿀사과슬랑이',
        status: 'APPROVED',
      }),
    };
    const recipes = {
      suggestRegistration: vi.fn().mockResolvedValue({
        automationDecision: 'auto_apply',
        recommendedQuantity: 1,
        reason: 'one match',
        proposals: [proposal],
      }),
    };
    const adapter = new ChannelRegistrationCapabilityAdapter(
      marketplace as never,
      recipes as never,
    );

    await expect(adapter.preflightExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      sourceCandidateId: 'candidate-1',
      listingName: '꿀사과슬랑이',
      itemName: null,
    })).resolves.toEqual({
      sellpiaMatch: {
        sellpiaInventorySkuId: proposal.sellpiaInventorySkuId,
        code: '10451-1',
        name: '3500꿀사과슬랑이',
        optionName: null,
        currentStock: 13,
        quantity: 1,
      },
      existingListing: {
        externalListingId: '427011919',
        displayName: '꿀사과슬랑이',
        status: 'APPROVED',
      },
    });
    expect(marketplace.findExistingExternalProductRegistration).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      externalVendorSku: '10451-1',
    });
  });

  it('blocks registration when the existing matcher cannot choose one Sellpia SKU', async () => {
    const marketplace = { findExistingExternalProductRegistration: vi.fn() };
    const recipes = {
      suggestRegistration: vi.fn().mockResolvedValue({
        automationDecision: 'blocked',
        recommendedQuantity: null,
        reason: 'No deterministic Sellpia evidence was found',
        proposals: [],
      }),
    };
    const adapter = new ChannelRegistrationCapabilityAdapter(
      marketplace as never,
      recipes as never,
    );

    await expect(adapter.preflightExternalProductRegistration({
      organizationId: 'org-1',
      channelAccountId: 'account-1',
      sourceCandidateId: 'candidate-1',
      listingName: '알 수 없는 상품',
      itemName: null,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(marketplace.findExistingExternalProductRegistration).not.toHaveBeenCalled();
  });
});
