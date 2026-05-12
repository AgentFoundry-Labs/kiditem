// Outgoing port for the marketplace catalog read model. Joins `Marketplace`
// with per-organization `WorkflowTemplate` installs to compute the
// `installed` flag. Agent install path is not wired; agents always report
// `installed: false`. The contract is Prisma-free; adapters own ORM rows.

import type { MarketplaceRecord } from '../persistence-records';

export const MARKETPLACE_CATALOG_REPOSITORY_PORT = Symbol(
  'MarketplaceCatalogRepositoryPort',
);

export interface MarketplaceCatalogQuery {
  module?: string;
  category?: string;
}

export interface AgentCatalogQuery {
  role?: string;
  category?: string;
}

export interface WorkflowCatalogReadout {
  /** Published workflow rows for the requested module/category. */
  rows: MarketplaceRecord[];
  /** Set of `Marketplace.id` values installed by `organizationId`. */
  installedIds: Set<string>;
}

export interface MarketplaceCatalogRepositoryPort {
  /** Fetch published workflow rows + per-org installed ids in one pass. */
  fetchWorkflowCatalog(
    organizationId: string,
    query: MarketplaceCatalogQuery,
  ): Promise<WorkflowCatalogReadout>;

  /** Fetch a single workflow row by id (catalog scope; no organization filter). */
  findWorkflowById(id: string): Promise<MarketplaceRecord | null>;

  /** Fetch published agent rows. */
  fetchAgentCatalog(query: AgentCatalogQuery): Promise<MarketplaceRecord[]>;

  /** Fetch a single agent row by id. */
  findAgentById(id: string): Promise<MarketplaceRecord | null>;
}
