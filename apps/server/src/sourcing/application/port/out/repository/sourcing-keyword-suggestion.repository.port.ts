import type {
  SourcingKeywordSuggestionItem,
  SourcingKeywordSuggestionObservationBatch,
} from '@kiditem/shared/sourcing';

export const SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT = Symbol(
  'SourcingKeywordSuggestionRepositoryPort',
);

export interface SourcingKeywordSuggestionLatestSnapshot {
  capturedAt: Date;
  items: SourcingKeywordSuggestionItem[];
  productNameTokens: SourcingKeywordSuggestionObservationBatch['productNameTokens'];
}

export interface SourcingKeywordSuggestionRepositoryPort {
  findLatest(input: {
    organizationId: string;
    normalizedKeyword: string;
  }): Promise<SourcingKeywordSuggestionLatestSnapshot | null>;
}
