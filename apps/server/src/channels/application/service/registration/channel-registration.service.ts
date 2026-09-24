import type { ChannelRecipeSuggestionResponse } from '@kiditem/shared/channel-product-matching';
import type {
  ChannelRegistrationPort, ExternalProductRegistrationPreflightInput,
  ExternalProductRegistrationPreflightResult,
} from '../../port/in/registration/channel-registration.port';
import type { ListingRegistrationPersistencePort } from '../../port/out/persistence/listing-registration.persistence.port';
import { RegistrationTargetException } from '../../exception/registration-target.exception';

export interface RegistrationRecipeSuggestions {
  suggestRegistration(organizationId: string, input: { channelListingOptionId: string; listingName: string; itemName: string | null }): Promise<ChannelRecipeSuggestionResponse>;
  resolveSelectedRegistrationSku(organizationId: string, masterProductId: string): Promise<{ masterProductId: string; code: string; name: string; optionName: string | null; currentStock: number | null }>;
}

export class ChannelRegistrationService implements ChannelRegistrationPort {
  constructor(
    private readonly repository: ListingRegistrationPersistencePort,
    private readonly recipeSuggestions: RegistrationRecipeSuggestions,
  ) {}

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

  async findExistingExternalProductRegistration(input: {
    organizationId: string;
    channelAccountId: string;
    externalVendorSku: string;
  }): Promise<{
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null> {
    await this.repository.assertActiveRegistrationAccount(input);
    const externalVendorSku = input.externalVendorSku.trim();
    if (!externalVendorSku) {
      throw new RegistrationTargetException('conflict',
        "A real Sellpia SKU code is required before registration.",
      );
    }
    return this.repository.findExistingActiveListingBySellerSku({
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      sellerSku: externalVendorSku,
    });
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
