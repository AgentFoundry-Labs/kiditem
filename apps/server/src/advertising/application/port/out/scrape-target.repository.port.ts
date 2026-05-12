// Outgoing port for `ScrapeTarget` CRUD. Application services (AdSyncService)
// depend on this contract; the Prisma-backed adapter lives in
// `adapter/out/repository/scrape-target.repository.adapter.ts`.

export const SCRAPE_TARGET_REPOSITORY_PORT = Symbol(
  'ScrapeTargetRepositoryPort',
);

export interface ScrapeTargetRow {
  id: string;
  organizationId: string;
  url: string;
  label: string;
  category: string;
  isActive: boolean;
  lastScrapedAt: Date | null;
  createdAt: Date;
}

export interface CreateScrapeTargetInput {
  url: string;
  label?: string;
  category?: string;
}

export interface ScrapeTargetRepositoryPort {
  listActive(organizationId: string): Promise<ScrapeTargetRow[]>;
  create(
    input: CreateScrapeTargetInput,
    organizationId: string,
  ): Promise<ScrapeTargetRow>;
  /** Stamps `lastScrapedAt` and re-reads with tenant scope; throws when not found. */
  markScraped(id: string, organizationId: string): Promise<ScrapeTargetRow>;
  /** Soft-deletes via `isActive=false` and re-reads; throws when not found. */
  softDelete(id: string, organizationId: string): Promise<ScrapeTargetRow>;
}
