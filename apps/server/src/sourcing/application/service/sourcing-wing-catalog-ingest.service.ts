import { Inject, Injectable } from '@nestjs/common';
import {
  SourcingWingCatalogKeywordSchema,
  SourcingWingCatalogSnapshotSchema,
  sourcingWingCatalogKeywordIdentity,
  type SourcingWingCatalogSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT,
  type SourcingRecommendationSourceRepositoryPort,
} from '../port/out/repository/sourcing-recommendation-source.repository.port';

/**
 * Wing 카탈로그 원천의 읽기: 발행 용도와 키워드 스냅숏. 수집은 확장 실행 kind `sourcing.wing_catalog`(KID-360)
 * 하나뿐이다 — 호출자가 없던 서버 수동 적재(POST workspace/coupang-observations)는 KID-389에서 지웠다.
 */
@Injectable()
export class SourcingWingCatalogIngestService {
  constructor(
    @Inject(SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT)
    private readonly sources: SourcingRecommendationSourceRepositoryPort,
  ) {}

  /** 끝난 Wing 검색 소싱 실행(KID-360)의 발행 용도. 발행이 없으면(실패·진행 중·다른 원천) null. */
  publishedPurpose(input: { organizationId: string; operationId: string }): Promise<string | null> {
    return this.sources.findWingPublicationPurpose(input);
  }

  async snapshot(input: { organizationId: string; keyword: string }): Promise<SourcingWingCatalogSnapshot> {
    const keyword = SourcingWingCatalogKeywordSchema.parse(input.keyword);
    const result = await this.sources.listWingCatalogSnapshot({
      organizationId: input.organizationId, normalizedKeyword: sourcingWingCatalogKeywordIdentity(keyword), limit: 400,
    });
    return SourcingWingCatalogSnapshotSchema.parse({ keyword,
      generatedAt: result.generatedAt?.toISOString() ?? null, items: result.items, rejectedCount: result.rejectedCount });
  }
}
