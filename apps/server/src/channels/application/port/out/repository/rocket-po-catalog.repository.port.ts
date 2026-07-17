import type {
  RocketPoCatalogPublication,
  RocketPoCatalogRow,
} from '@kiditem/shared/rocket-purchase-preview';
import type { RocketPoCatalogIdentity } from '../../in/rocket-po-catalog.port';

export interface RocketPoCatalogRepositoryPort {
  findActiveRocketAccount(input: {
    organizationId: string;
    channelAccountId: string;
  }): Promise<{ vendorId: string | null } | null>;

  publish(input: {
    organizationId: string;
    userId: string;
    channelAccountId: string;
    vendorId: string;
    fileName: 'rocket-po-catalog.json';
    artifactHash: string;
    rows: RocketPoCatalogRow[];
  }): Promise<RocketPoCatalogPublication & {
    identities: RocketPoCatalogIdentity[];
  }>;
}

export const ROCKET_PO_CATALOG_REPOSITORY_PORT = Symbol(
  'ROCKET_PO_CATALOG_REPOSITORY_PORT',
);
