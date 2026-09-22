import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { ChannelListingRegistrationResult } from '@kiditem/shared/channel-listing';
import type { ChannelRecipeSuggestionResponse } from '@kiditem/shared/channel-product-matching';
import type {
  ChannelRegistrationPort, ExternalProductRegistrationMatchPreviewInput,
  ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput,
  ExternalProductRegistrationPreflightResult, ResolveProductRegistrationCapabilityInput,
  ResolveProductRegistrationWithOwnerReceiptInput,
} from '../../port/in/registration/channel-registration.port';
import type { ListingRegistrationPersistencePort } from '../../port/out/persistence/listing-registration.persistence.port';
import { RegistrationTargetException } from '../../exception/registration-target.exception';

export interface RegistrationRecipeSuggestions {
  suggestRegistration(organizationId: string, input: { sourceCandidateId: string; listingName: string; itemName: string | null }): Promise<ChannelRecipeSuggestionResponse>;
  resolveSelectedRegistrationSku(organizationId: string, masterProductId: string): Promise<{ masterProductId: string; code: string; name: string; optionName: string | null; currentStock: number | null }>;
}

export class ChannelRegistrationService implements ChannelRegistrationPort {
  constructor(
    private readonly repository: ListingRegistrationPersistencePort,
    private readonly recipeSuggestions: RegistrationRecipeSuggestions,
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
        sellpiaInventorySkuId: item.masterProductId,
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
        throw new RegistrationTargetException('conflict',
          "셀피아 상품의 판매 1개당 차감수량을 1 이상의 정수로 입력하세요.",
        );
      }
      return this.finishPreflight(
        input,
        toSellpiaMatch(selectedSku, input.selectedQuantity!),
      );
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
      throw new RegistrationTargetException('conflict',
        "등록 전에 셀피아 상품을 연결하고 차감수량을 확인하세요.",
      );
    }
    return this.finishPreflight(input, toSellpiaMatch(proposal, quantity!));
  }

  private async finishPreflight(
    input: ExternalProductRegistrationPreflightInput,
    sellpiaMatch: ExternalProductRegistrationPreflightResult["sellpiaMatch"],
  ): Promise<ExternalProductRegistrationPreflightResult> {
    const existingListing = sellpiaMatch.quantity === 1
      ? await this.findExistingExternalProductRegistration(
        {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          externalVendorSku: sellpiaMatch.code,
        },
      ) : null;
    return { sellpiaMatch, existingListing };
  }

  async assertExternalProductRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: "coupang"; vendorId: string }> {
    const account =
      await this.repository.assertActiveRegistrationAccount(input);
    if (account.channel !== "coupang") {
      throw new RegistrationTargetException('conflict',
        "External registration confirmation requires an active Coupang Wing account.",
      );
    }
    const vendorId =
      account.vendorId?.trim() || account.externalAccountId?.trim() || "";
    if (!vendorId) {
      throw new RegistrationTargetException('conflict',
        "External registration requires a persisted Coupang Wing vendor identity.",
      );
    }
    return { channel: "coupang", vendorId };
  }

  async findExistingExternalProductRegistration(input: {
    organizationId: string;
    channelAccountId: string;
    externalVendorSku: string;
  }): Promise<{
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null> {
    await this.assertExternalProductRegistrationAccount(input);
    const externalVendorSku = input.externalVendorSku.trim();
    if (!externalVendorSku) {
      throw new RegistrationTargetException('conflict',
        "A real Sellpia SKU code is required before Coupang registration.",
      );
    }
    return this.repository.findExistingActiveListingBySellerSku({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sellerSku: externalVendorSku,
    });
  }

  resolveProductRegistration(
    transaction: OwnerTransaction,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.repository.resolveProductRegistration(transaction, input);
  }

  resolveProductRegistrationWithOwnerReceipt(
    transaction: OwnerTransaction,
    input: ResolveProductRegistrationWithOwnerReceiptInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.repository.resolveProductRegistrationWithOwnerReceipt(
      transaction,
      input,
    );
  }
}

function toSellpiaMatch(
  proposal: {
    masterProductId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number | null;
  },
  quantity: number,
): ExternalProductRegistrationPreflightResult["sellpiaMatch"] {
  return {
    sellpiaInventorySkuId: proposal.masterProductId,
    code: proposal.code,
    name: proposal.name,
    optionName: proposal.optionName,
    currentStock: proposal.currentStock,
    quantity,
  };
}
