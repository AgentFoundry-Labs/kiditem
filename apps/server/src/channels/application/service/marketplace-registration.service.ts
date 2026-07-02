import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
  type MarketplaceRegistrationRepositoryPort,
  type RegisteredMarketplaceListingResult,
  type RegisterConfirmedListingInput,
} from '../port/out/repository/channel-listing.repository.port';
import {
  CHANNELS_PRODUCT_MASTER_BARCODE_PORT,
  type ChannelsProductMasterBarcodePort,
} from '../port/out/cross-domain/product-master-barcode.port';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangCreateSellerProductResponse,
  type CoupangProviderPort,
  type CoupangSellerProductPayload,
} from '../port/out/provider/coupang-provider.port';

export interface RegisterConfirmedMarketplaceListingInput
  extends RegisterConfirmedListingInput {
  productBarcode?: string | null;
}

export interface SubmitCoupangMarketplaceListingInput {
  masterId: string;
  channelAccountId: string;
  productBarcode?: string | null;
  listingPayload: CoupangSellerProductPayload;
}

export interface SubmittedCoupangMarketplaceListingResult {
  listingId: string;
  sellerProductId: string;
  masterId: string;
  channel: string;
  channelAccountId: string | null;
  externalId: string;
  status: string | null;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sellerProductName(payload: CoupangSellerProductPayload): string | null {
  return stringField(payload.sellerProductName);
}

function firstSalePrice(payload: CoupangSellerProductPayload): number | null {
  if (!Array.isArray(payload.items)) return null;
  const [first] = payload.items;
  if (!first || typeof first !== 'object') return null;
  return numberField((first as Record<string, unknown>).salePrice);
}

function extractNestedSellerProductId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  return extractNestedSellerProductId((value as Record<string, unknown>).data);
}

function sellerProductIdFromResponse(
  response: CoupangCreateSellerProductResponse,
): string {
  const sellerProductId = extractNestedSellerProductId(response.data);
  if (sellerProductId) return sellerProductId;
  const message = stringField(response.message) ?? stringField(response.details);
  throw new Error(
    message
      ? `Coupang seller product creation did not return sellerProductId: ${message}`
      : 'Coupang seller product creation did not return sellerProductId.',
  );
}

@Injectable()
export class MarketplaceRegistrationService {
  constructor(
    @Inject(MARKETPLACE_REGISTRATION_REPOSITORY_PORT)
    private readonly repository: MarketplaceRegistrationRepositoryPort,
    @Inject(CHANNELS_PRODUCT_MASTER_BARCODE_PORT)
    private readonly productBarcodes: ChannelsProductMasterBarcodePort,
    @Optional()
    @Inject(COUPANG_PROVIDER_PORT)
    private readonly coupang?: CoupangProviderPort,
  ) {}

  async registerConfirmedListing(
    organizationId: string,
    input: RegisterConfirmedMarketplaceListingInput,
  ): Promise<RegisteredMarketplaceListingResult> {
    const { productBarcode, ...listingInput } = input;
    const barcode = productBarcode?.trim();
    if (barcode) {
      await this.productBarcodes.assertMasterBarcodeAvailable({
        organizationId,
        masterId: input.masterId,
        barcode,
      });
    }

    const listing = await this.repository.registerConfirmedListing(organizationId, listingInput);
    if (barcode) {
      await this.productBarcodes.updateMasterBarcode({
        organizationId,
        masterId: input.masterId,
        barcode,
      });
    }
    return listing;
  }

  async submitCoupangListing(
    organizationId: string,
    input: SubmitCoupangMarketplaceListingInput,
  ): Promise<SubmittedCoupangMarketplaceListingResult> {
    if (!this.coupang) {
      throw new Error('COUPANG_PROVIDER_PORT is required to submit Coupang listings.');
    }

    const barcode = input.productBarcode?.trim();
    if (barcode) {
      await this.productBarcodes.assertMasterBarcodeAvailable({
        organizationId,
        masterId: input.masterId,
        barcode,
      });
    }

    const response = await this.coupang.createSellerProduct(
      organizationId,
      input.listingPayload,
    );
    const sellerProductId = sellerProductIdFromResponse(response);
    const listing = await this.repository.registerConfirmedListing(organizationId, {
      masterId: input.masterId,
      channelAccountId: input.channelAccountId,
      externalId: sellerProductId,
      channelName: sellerProductName(input.listingPayload),
      channelPrice: firstSalePrice(input.listingPayload),
    });

    if (barcode) {
      await this.productBarcodes.updateMasterBarcode({
        organizationId,
        masterId: input.masterId,
        barcode,
      });
    }

    return {
      listingId: listing.id,
      sellerProductId,
      masterId: listing.masterId,
      channel: listing.channel,
      channelAccountId: listing.channelAccountId,
      externalId: listing.externalId,
      status: listing.status,
    };
  }
}
