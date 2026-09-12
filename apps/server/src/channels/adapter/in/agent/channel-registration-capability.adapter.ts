import { ConflictException, Injectable } from "@nestjs/common";
import type {
  ChannelsMarketplaceRegistrationCapabilityPort,
  ExternalProductRegistrationMatchPreviewInput,
  ExternalProductRegistrationMatchPreviewResult,
  ExternalProductRegistrationPreflightInput,
  ExternalProductRegistrationPreflightResult,
  ResolveProductRegistrationCapabilityInput,
  ResolveProductRegistrationWithOwnerReceiptInput,
} from "../../../application/port/in/capability/marketplace-registration.port";
import type { ChannelListingRegistrationResult } from "@kiditem/shared/channel-listing";
import { MarketplaceRegistrationService } from "../../../application/service/marketplace-registration.service";
import { ChannelRecipeSuggestionService } from "../../../application/service/channel-recipe-suggestion.service";

/**
 * Channels-owned registration boundary used by Sourcing.
 *
 * The retired family-master Agent capabilities are intentionally absent:
 * registration now starts from a ProductPreparation and resolves an
 * account-scoped ChannelListing without creating or mutating Sellpia masters.
 */
@Injectable()
export class ChannelRegistrationCapabilityAdapter implements ChannelsMarketplaceRegistrationCapabilityPort {
  constructor(
    private readonly marketplaceRegistration: MarketplaceRegistrationService,
    private readonly recipeSuggestions: ChannelRecipeSuggestionService,
  ) {}

  async previewExternalProductRegistrationMatch(
    input: ExternalProductRegistrationMatchPreviewInput,
  ): Promise<ExternalProductRegistrationMatchPreviewResult> {
    const suggestion = await this.recipeSuggestions.suggestRegistration(
      input.organizationId,
      input,
    );
    const proposal =
      suggestion.automationDecision === "auto_apply" &&
      suggestion.proposals.length === 1
        ? suggestion.proposals[0]
        : undefined;
    const quantity =
      proposal?.recommendedQuantity ?? suggestion.recommendedQuantity;
    const sellpiaMatch =
      proposal && Number.isSafeInteger(quantity) && (quantity ?? 0) > 0
        ? toSellpiaMatch(proposal, quantity!)
        : null;
    return {
      status: sellpiaMatch ? "matched" : "selection_required",
      reason: sellpiaMatch
        ? "상품명으로 셀피아 재고 1건을 자동 매칭했습니다."
        : suggestion.proposals.length > 0
          ? "자동으로 확정할 수 없습니다. 추천 후보를 확인하거나 셀피아 재고를 검색하세요."
          : "상품명과 일치하는 셀피아 재고를 찾지 못했습니다.",
      sellpiaMatch,
      proposals: suggestion.proposals.map((item) => ({
        sellpiaInventorySkuId: item.sellpiaInventorySkuId,
        code: item.code,
        name: item.name,
        optionName: item.optionName,
        currentStock: item.currentStock,
        recommendedQuantity: item.recommendedQuantity,
      })),
    };
  }

  async preflightExternalProductRegistration(
    input: ExternalProductRegistrationPreflightInput,
  ): Promise<ExternalProductRegistrationPreflightResult> {
    if (input.selectedSellpiaInventorySkuId) {
      const selectedSku =
        await this.recipeSuggestions.resolveSelectedRegistrationSku(
          input.organizationId,
          input.selectedSellpiaInventorySkuId,
        );
      if (
        !Number.isSafeInteger(input.selectedQuantity) ||
        (input.selectedQuantity ?? 0) <= 0
      ) {
        throw new ConflictException(
          "셀피아 상품의 판매 1개당 차감수량을 1 이상의 정수로 입력하세요.",
        );
      }
      return this.finishPreflight(input, {
        ...selectedSku,
        quantity: input.selectedQuantity!,
      });
    }
    const suggestion = await this.recipeSuggestions.suggestRegistration(
      input.organizationId,
      input,
    );
    const proposal =
      suggestion.automationDecision === "auto_apply" &&
      suggestion.proposals.length === 1
        ? suggestion.proposals[0]
        : undefined;
    const quantity =
      proposal?.recommendedQuantity ?? suggestion.recommendedQuantity;
    if (!proposal || !Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0) {
      throw new ConflictException(
        "등록 전에 셀피아 상품을 연결하고 차감수량을 확인하세요.",
      );
    }
    return this.finishPreflight(input, toSellpiaMatch(proposal, quantity!));
  }

  private async finishPreflight(
    input: ExternalProductRegistrationPreflightInput,
    sellpiaMatch: ExternalProductRegistrationPreflightResult["sellpiaMatch"],
  ): Promise<ExternalProductRegistrationPreflightResult> {
    const existingListing =
      await this.marketplaceRegistration.findExistingExternalProductRegistration(
        {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          externalVendorSku: sellpiaMatch.code,
        },
      );
    return { sellpiaMatch, existingListing };
  }

  assertExternalProductRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: "coupang"; vendorId: string }> {
    return this.marketplaceRegistration.assertExternalProductRegistrationAccount(
      input,
    );
  }

  resolveProductRegistration(
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.marketplaceRegistration.resolveProductRegistration(
      transaction,
      input,
    );
  }

  resolveProductRegistrationWithOwnerReceipt(
    transaction: object,
    input: ResolveProductRegistrationWithOwnerReceiptInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.marketplaceRegistration.resolveProductRegistrationWithOwnerReceipt(
      transaction,
      input,
    );
  }
}

function toSellpiaMatch(
  proposal: {
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number;
  },
  quantity: number,
): ExternalProductRegistrationPreflightResult["sellpiaMatch"] {
  return {
    sellpiaInventorySkuId: proposal.sellpiaInventorySkuId,
    code: proposal.code,
    name: proposal.name,
    optionName: proposal.optionName,
    currentStock: proposal.currentStock,
    quantity,
  };
}
