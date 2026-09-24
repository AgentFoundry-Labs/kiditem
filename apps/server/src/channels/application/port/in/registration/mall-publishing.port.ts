import type {
  MallAdapterManifestView,
  MallChannelOverview,
  MallListingMatrixResponse,
  MallMatrixFilter,
  MallAvailabilityPreview,
  MallPreflightResponse,
  MallPublishTarget,
} from '@kiditem/shared/mall-publishing';

export const MALL_PUBLISHING_PORT = Symbol('MALL_PUBLISHING_PORT');
export interface MallMatrixRequest {
  search?: string;
  mallKeys?: string[];
  filter?: MallMatrixFilter;
  page: number;
  limit: number;
}
export interface MallPreflightQuery {
  mallKeys?: string[];
  masterProductIds?: string[];
  search?: string;
  page: number;
  limit: number;
}
export interface MallPublishingPort {
  listManifests(): MallAdapterManifestView[];
  listTargets(organizationId: string): Promise<MallPublishTarget[]>;
  preflight(
    organizationId: string,
    query: MallPreflightQuery,
    asOf: Date,
  ): Promise<MallPreflightResponse>;
  previewAvailability(
    organizationId: string,
    limit: number,
  ): Promise<MallAvailabilityPreview>;
  listingMatrix(
    organizationId: string,
    query: MallMatrixRequest,
  ): Promise<MallListingMatrixResponse>;
  channelOverview(organizationId: string): Promise<MallChannelOverview>;
}
