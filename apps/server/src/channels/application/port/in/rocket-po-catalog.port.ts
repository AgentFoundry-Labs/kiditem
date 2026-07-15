import type {
  RocketPoCatalogPublication,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewRequest,
} from '@kiditem/shared/rocket-purchase-preview';

export type RocketPoCatalogIdentity = {
  poLineId: string;
  channelSkuId: string;
};

export type RocketPoCatalogResolution = {
  blockingReason: Extract<
    RocketPurchasePreviewReason,
    'collection_incomplete' | 'vendor_mismatch'
  > | null;
  catalog: RocketPoCatalogPublication | null;
  identities: RocketPoCatalogIdentity[];
};

export interface RocketPoCatalogPort {
  publishAndResolve(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPoCatalogResolution>;
}

export const ROCKET_PO_CATALOG_PORT = Symbol('ROCKET_PO_CATALOG_PORT');
