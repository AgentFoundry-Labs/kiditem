import type { Sourcing1688BatchUnitResult, Sourcing1688SearchItem } from '@kiditem/shared/sourcing';

export const SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT = Symbol(
  'Sourcing1688SearchResultRepositoryPort',
);

export const SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION =
  'sourcing-1688-search-result/v1';
export const SOURCING_1688_KEYWORD_COLLECTOR_KEY =
  'server-1688-keyword-search';
export const SOURCING_1688_IMAGE_COLLECTOR_KEY =
  'server-1688-image-match';

export interface Sourcing1688ResolvedImageTarget {
  targetId: string;
  imageUrl: string;
  searchQuery: string;
}

export interface Sourcing1688StoredSearchObservation {
  keyword: string;
  targetId: string | null;
  capturedAt: Date;
  items: Sourcing1688SearchItem[];
}

export interface Sourcing1688StoredSearchSnapshot {
  generatedAt: Date | null;
  observations: Sourcing1688StoredSearchObservation[];
}

export interface Sourcing1688SearchResultRepositoryPort {
  findUnitResult(input: { organizationId: string; attemptId: string; sourceKey: '1688.hot_product' | '1688.image_search' }): Promise<Sourcing1688BatchUnitResult | null>;
  resolveImageTargets(input: {
    organizationId: string;
    targetIds: string[];
  }): Promise<{
    targets: Sourcing1688ResolvedImageTarget[];
    missingTargetIds: string[];
  }>;
  findLatest(input: {
    organizationId: string;
    keywords?: string[];
    targetIds?: string[];
    completeAttemptIds?: string[];
  }): Promise<Sourcing1688StoredSearchSnapshot>;
}
