import { Inject, Injectable } from '@nestjs/common';
import {
  SourcingKeywordSuggestionSnapshotSchema,
  SourcingWingCatalogKeywordSchema,
  SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
  SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
  sourcingWingCatalogKeywordIdentity,
  type SourcingKeywordSuggestionSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT,
  type SourcingKeywordSuggestionRepositoryPort,
} from '../port/out/repository/sourcing-keyword-suggestion.repository.port';

/**
 * 쿠팡 추천 키워드의 현재 스냅숏 읽기. 수집은 실행 kind `sourcing.coupang_keyword_suggestion`(KID-360)이다.
 */
@Injectable()
export class SourcingKeywordSuggestionService {
  constructor(
    @Inject(SOURCING_KEYWORD_SUGGESTION_REPOSITORY_PORT)
    private readonly snapshots: SourcingKeywordSuggestionRepositoryPort,
  ) {}

  async snapshot(input: {
    organizationId: string;
    keyword: string;
  }): Promise<SourcingKeywordSuggestionSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const normalizedKeyword = sourcingWingCatalogKeywordIdentity(keyword);
    const latest = await this.snapshots.findLatest({
      organizationId: input.organizationId,
      normalizedKeyword,
    });
    return SourcingKeywordSuggestionSnapshotSchema.parse({
      keyword,
      generatedAt: latest?.capturedAt.toISOString() ?? null,
      sourceKey: SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
      schemaVersion: SOURCING_KEYWORD_SUGGESTION_SCHEMA_VERSION,
      items: latest?.items ?? [],
      productNameTokens: latest?.productNameTokens ?? [],
    });
  }
}
