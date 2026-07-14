import type {
  ChannelSkuAvailabilityItem,
  ChannelSkuAvailabilityListResponse,
  ChannelSkuAvailabilityQuery,
} from '@kiditem/shared/channel-sku-availability';

export const CHANNEL_SKU_AVAILABILITY_PORT = Symbol(
  'CHANNEL_SKU_AVAILABILITY_PORT',
);

export interface ChannelSkuAvailabilityPort {
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
