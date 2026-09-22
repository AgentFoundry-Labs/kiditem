import type {
  ChannelSkuAvailabilityItem,
  ChannelSkuAvailabilityListResponse,
  ChannelSkuAvailabilityQuery,
} from '@kiditem/shared/channel-sku-availability';

export const CHANNEL_SKU_AVAILABILITY_PORT = Symbol(
  'CHANNEL_SKU_AVAILABILITY_PORT',
);

export interface ChannelSkuAvailabilityPort {
  updateSafetyStock(organizationId: string, optionId: string, safetyStock: number): Promise<{ channelListingOptionId: string; safetyStock: number }>;
  list(
    organizationId: string,
    query: ChannelSkuAvailabilityQuery,
  ): Promise<ChannelSkuAvailabilityListResponse>;
  findByChannelSkuIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]>;
  findByListingIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]>;
}
