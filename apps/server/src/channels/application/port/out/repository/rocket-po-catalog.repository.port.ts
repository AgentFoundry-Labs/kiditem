import type {
  RocketPoCatalogPublication,
  RocketPoCatalogRow,
  RocketPoCollectionEvidence,
  RocketSavedPoCollection,
  RocketSavedPoSummary,
} from '@kiditem/shared/rocket-purchase-preview';
import type { RocketPoCatalogIdentity } from '../../in/rocket-po-catalog.port';

export interface RocketPoCatalogRepositoryPort {
  findActiveRocketAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{
    vendorId: string | null;
    sharedCoupangVendorId: string | null;
  } | null>;

  publish(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    vendorId: string;
    fileName: 'rocket-po-catalog.json';
    artifactHash: string;
    collection: RocketPoCollectionEvidence;
    rows: RocketPoCatalogRow[];
  }): Promise<RocketPoCatalogPublication & {
    identities: RocketPoCatalogIdentity[];
  }>;

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

export const ROCKET_PO_CATALOG_REPOSITORY_PORT = Symbol(
  'ROCKET_PO_CATALOG_REPOSITORY_PORT',
);
