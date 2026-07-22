import type {
  RocketPoCatalogPublication,
  RocketPurchasePreviewReason,
  RocketPurchasePreviewRequest,
  RocketSavedPoCollection,
  RocketSavedPoSummary,
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

  listSavedPos(input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  }): Promise<RocketSavedPoSummary[]>;

  loadSavedCollection(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  }): Promise<RocketSavedPoCollection | null>;
}

export const ROCKET_PO_CATALOG_PORT = Symbol('ROCKET_PO_CATALOG_PORT');
