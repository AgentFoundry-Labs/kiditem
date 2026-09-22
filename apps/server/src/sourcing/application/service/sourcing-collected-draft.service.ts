import { Inject, Injectable } from '@nestjs/common';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftPort,
} from '../port/out/cross-domain/sales-product-draft.port';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';

/**
 * 수집이 끝난 뒤 그 실행이 남긴 후보마다 판매상품 초안을 보장한다(KID-310 · ADR-0022).
 *
 * 수집한 상품의 편집 정본은 초안이다. 브라우저 수집은 attempt 트랜잭션 안에서 후보를 쓰므로
 * 후보 저장소의 초안 만들기를 지나지 않는다 — 그래서 수집 완료를 조율하는 자리가 커밋 뒤에
 * 여기로 들어온다. 초안 만들기는 멱등이라 같은 상품을 다시 수집해도 초안은 하나다.
 *
 * 후보를 만들지 않는 원천(트렌드 · 틱톡 · 키워드)은 빈 집합으로 들어와 아무 일도 하지 않는다.
 */
@Injectable()
export class SourcingCollectedDraftService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly drafts: SalesProductDraftPort,
  ) {}

  /** 이 후보들의 초안을 보장한다. 이미 있으면 건너뛴다. */
  async ensureDraftsForCandidates(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return;
    const existing = await this.drafts.findDraftIdsForSources(organizationId, unique);
    const missing = unique.filter((candidateId) => !existing.has(candidateId));
    if (missing.length === 0) return;
    for (const facts of await this.candidates.readDraftSourceFacts(organizationId, missing)) {
      await this.drafts.createFromSource(organizationId, facts);
    }
  }

  /**
   * 원천 정체성으로 후보를 찾아 초안을 보장한다. 확장 투영은 후보 id 를 돌려주지 않고
   * 정체성(플랫폼 · 해시 · 주소)만 들고 있다.
   */
  async ensureDraftsForSourceIdentities(
    organizationId: string,
    identities: readonly {
      sourcePlatform: string;
      sourceIdentityHash: string | null;
      sourceUrl: string;
    }[],
  ): Promise<void> {
    if (identities.length === 0) return;
    await this.ensureDraftsForCandidates(
      organizationId,
      await this.candidates.findIdsBySourceIdentities(organizationId, identities),
    );
  }
}
