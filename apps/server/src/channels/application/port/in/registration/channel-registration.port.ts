import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { PreparedRegistrationRecipe } from '../../../../domain/registration/registration-item-code';
import type { ChannelListingRegistrationResult } from '@kiditem/shared/channel-listing';

export interface ResolveProductRegistrationCapabilityInput {
  organizationId: string;
  /** 등록 설정의 주인(판매상품 초안). 원천 후보가 아니라 이 상품이 몰 상품의 주인이 된다. */
  salesProductId: string;
  channelAccountId: string;
  submissionKey: string;
  preparedRecipe?: PreparedRegistrationRecipe;
  externalListingId: string;
  displayName: string;
  masterProductId?: string;
  optionLinks?: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
}

/**
 * Channels-owned local listing resolution. Provider payload/state is never
 * carried through this receipt boundary.
 */
export interface ResolveProductRegistrationWithOwnerReceiptInput {
  organizationId: string;
  salesProductId: string;
  channelAccountId: string;
  submissionKey: string;
  preparedRecipe?: PreparedRegistrationRecipe;
  externalListingId: string;
  displayName: string;
  masterProductId?: string;
  optionLinks?: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
  ownerCapabilityKey: 'channels.register_confirmed_listing';
  ownerIdempotencyKey: string;
  ownerRequestHash: string;
}

export interface ExternalProductRegistrationPreflightInput {
  organizationId: string;
  channelAccountId: string;
  /**
   * 레시피 추천이 되돌려 줄 상관 키. 아직 몰에 올라가지 않은 등록이라 실제 몰 옵션은
   * 없고, 이 등록을 부르는 판매상품 id 를 그 자리에 쓴다.
   */
  channelListingOptionId: string;
  listingName: string;
  itemName: string | null;
  selectedSellpiaInventorySkuId?: string;
  selectedQuantity?: number;
}

export type ExternalProductRegistrationMatchPreviewInput = Omit<
  ExternalProductRegistrationPreflightInput,
  'channelAccountId' | 'selectedSellpiaInventorySkuId' | 'selectedQuantity'
>;

export interface ExternalProductRegistrationMatchProposal {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number | null;
  recommendedQuantity: number | null;
}

export interface ExternalProductRegistrationMatchPreviewResult {
  status: 'matched' | 'selection_required';
  reason: string;
  sellpiaMatch:
    ExternalProductRegistrationPreflightResult['sellpiaMatch'] | null;
  proposals: ExternalProductRegistrationMatchProposal[];
}

export interface ExternalProductRegistrationPreflightResult {
  sellpiaMatch: {
    sellpiaInventorySkuId: string;
    code: string;
    name: string;
    optionName: string | null;
    currentStock: number | null;
    quantity: number;
  };
  existingListing: {
    externalListingId: string;
    displayName: string;
    status: string | null;
  } | null;
}

export const CHANNEL_REGISTRATION_PORT = Symbol('CHANNEL_REGISTRATION_PORT');

export interface ChannelRegistrationPort {
  previewExternalProductRegistrationMatch(
    input: ExternalProductRegistrationMatchPreviewInput,
  ): Promise<ExternalProductRegistrationMatchPreviewResult>;

  preflightExternalProductRegistration(
    input: ExternalProductRegistrationPreflightInput,
  ): Promise<ExternalProductRegistrationPreflightResult>;

  assertExternalProductRegistrationAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ channel: 'coupang'; vendorId: string }>;

  resolveProductRegistration(
    transaction: OwnerTransaction,
    input: ResolveProductRegistrationCapabilityInput,
  ): Promise<ChannelListingRegistrationResult>;

  resolveProductRegistrationWithOwnerReceipt(
    transaction: OwnerTransaction,
    input: ResolveProductRegistrationWithOwnerReceiptInput,
  ): Promise<ChannelListingRegistrationResult>;
}
