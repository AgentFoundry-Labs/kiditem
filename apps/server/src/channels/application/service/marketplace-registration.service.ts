import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { ChannelListingRegistrationResult } from "@kiditem/shared/channel-listing";
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
} from "../port/out/repository/channel-listing.repository.port";
import type {
  ResolveProductRegistrationCapabilityInput,
  ResolveProductRegistrationWithOwnerReceiptInput,
} from "../port/in/capability/marketplace-registration.port";

@Injectable()
export class MarketplaceRegistrationService {
  constructor(
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly repository: MarketplaceRegistrationRepositoryPort,
  ) {}

  async assertExternalProductRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: "coupang"; vendorId: string }> {
    const account =
      await this.repository.assertActiveRegistrationAccount(input);
    if (account.channel !== "coupang") {
      throw new ConflictException(
        "External registration confirmation requires an active Coupang Wing account.",
      );
    }
    const vendorId =
      account.vendorId?.trim() || account.externalAccountId?.trim() || "";
    if (!vendorId) {
      throw new ConflictException(
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
      throw new ConflictException(
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
    transaction: object,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.repository.resolveProductRegistration(transaction, input);
  }

  resolveProductRegistrationWithOwnerReceipt(
    transaction: object,
    input: ResolveProductRegistrationWithOwnerReceiptInput,
  ): Promise<ChannelListingRegistrationResult> {
    return this.repository.resolveProductRegistrationWithOwnerReceipt(
      transaction,
      input,
    );
  }
}
