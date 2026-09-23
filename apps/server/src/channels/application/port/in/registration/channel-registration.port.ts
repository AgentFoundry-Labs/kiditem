
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
  preflightExternalProductRegistration(
    input: ExternalProductRegistrationPreflightInput,
  ): Promise<ExternalProductRegistrationPreflightResult>;
}
