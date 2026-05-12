// Outgoing port for the marketplace catalog read model. Joins `Marketplace`
// with per-organization `WorkflowTemplate` installs to compute the
// `installed` flag. Agent install path is not wired; agents always report
// `installed: false`.

import type { Marketplace } from '@prisma/client';

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
  rows: Marketplace[];
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
  findWorkflowById(id: string): Promise<Marketplace | null>;

  /** Fetch published agent rows. */
  fetchAgentCatalog(query: AgentCatalogQuery): Promise<Marketplace[]>;

  /** Fetch a single agent row by id. */
  findAgentById(id: string): Promise<Marketplace | null>;
}
