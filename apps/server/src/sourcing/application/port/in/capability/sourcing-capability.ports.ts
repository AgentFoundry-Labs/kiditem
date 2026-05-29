export const SOURCING_DUPLICATE_CHECK_PORT = Symbol(
  'SOURCING_DUPLICATE_CHECK_PORT',
);
export const SOURCING_SCRAPE_PRODUCT_URL_PORT = Symbol(
  'SOURCING_SCRAPE_PRODUCT_URL_PORT',
);
export const SOURCING_INGEST_CANDIDATE_PORT = Symbol(
  'SOURCING_INGEST_CANDIDATE_PORT',
);
export const SOURCING_SCRAPE_URL_WORKFLOW_PORT = Symbol(
  'SOURCING_SCRAPE_URL_WORKFLOW_PORT',
);
export const SOURCING_DISCOVERY_CAPABILITY_PORT = Symbol(
  'SOURCING_DISCOVERY_CAPABILITY_PORT',
);

export interface SourcingDuplicateCheckInput {
  organizationId: string;
  sourceUrl: string;
}

export interface SourcingDuplicateCheckResult {
  duplicate: boolean;
  candidateId: string | null;
  href: string | null;
}

export interface SourcingDuplicateCheckPort {
  checkDuplicate(
    input: SourcingDuplicateCheckInput,
  ): Promise<SourcingDuplicateCheckResult>;
}

export interface SourcingScrapeProductUrlInput {
  organizationId: string;
  sourceUrl: string;
  platform?: string;
  triggeredByUserId?: string | null;
}

export interface SourcingProductSnapshot {
  sourceUrl: string;
  platform?: string;
  title?: string | null;
  price?: number | null;
  currency?: string | null;
  images?: string[];
  attributes?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface SourcingScrapeProductUrlResult {
  snapshot: SourcingProductSnapshot;
}

export interface SourcingScrapeProductUrlPort {
  scrapeProductUrl(
    input: SourcingScrapeProductUrlInput,
  ): Promise<SourcingScrapeProductUrlResult>;
}

export interface SourcingIngestCandidateInput {
  organizationId: string;
  snapshot: SourcingProductSnapshot;
  triggeredByUserId?: string | null;
}

export interface SourcingIngestCandidateResult {
  candidateId: string;
  href: string;
}

export interface SourcingIngestCandidatePort {
  ingestCandidate(
    input: SourcingIngestCandidateInput,
  ): Promise<SourcingIngestCandidateResult>;
}

export interface SourcingScrapeUrlWorkflowInput {
  organizationId: string;
  sourceUrl: string;
  triggeredByUserId?: string | null;
}

export interface SourcingScrapeUrlWorkflowResult {
  skipped: boolean;
  candidateId: string | null;
  href: string | null;
  operationKey: string | null;
}

export interface SourcingScrapeUrlWorkflowPort {
  scrapeUrlWorkflow(
    input: SourcingScrapeUrlWorkflowInput,
  ): Promise<SourcingScrapeUrlWorkflowResult>;
}

export interface SourcingDiscoveryCapabilityInput {
  organizationId: string;
  keyword: string;
  category?: string | null;
  mode?: 'stub' | 'replay';
}

export interface SourcingDiscoveryCapabilityResult {
  artifacts: Array<{
    artifactType: string;
    title: string;
    summary: Record<string, unknown>;
  }>;
}

export interface SourcingDiscoveryCapabilityPort {
  executeDiscoveryCapability(
    input: SourcingDiscoveryCapabilityInput,
  ): Promise<SourcingDiscoveryCapabilityResult>;
}
