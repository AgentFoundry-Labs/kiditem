import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  CANDIDATE_REGISTRATION_PORT,
  type CandidateRegistrationPort,
} from '../../../channels/application/port/in/candidate-registration.port';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftPort,
} from '../port/out/cross-domain/sales-product-draft.port';
import type { RejectCandidateCommand } from '../port/in/sourcing.commands';

/** Candidate terminal-state service retained for rejection only. */
@Injectable()
export class SourcingPromotionService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(CANDIDATE_REGISTRATION_PORT)
    private readonly preparations: CandidateRegistrationPort,
    @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly salesProductDrafts: SalesProductDraftPort,
  ) {}

  async reject(
    candidateId: string,
    organizationId: string,
    body: RejectCandidateCommand,
    userId: string | null,
  ): Promise<{ status: 'rejected'; draftRetired?: boolean; draftWarning?: string }> {
    return this.candidates.runInTransaction(async (tx, ownerTx) => {
      await this.candidates.lockCandidate(tx, { id: candidateId, organizationId });
      const candidate = await this.candidates.findCandidateState(tx, {
        id: candidateId,
        organizationId,
      });
      if (!candidate) throw new NotFoundException('Sourcing candidate not found');
      if (candidate.status !== 'sourced') {
        throw new UnprocessableEntityException(
          `Candidate cannot be rejected from status '${candidate.status}'`,
        );
      }
      await this.preparations.assertCandidateTerminalTransitionAllowed(ownerTx, {
        organizationId,
        sourceCandidateId: candidateId,
      });
      const { count } = await this.candidates.rejectCandidate(tx, {
        id: candidateId,
        organizationId,
        reason: body.reason ?? null,
        rejectedByUserId: userId,
        rejectedAt: new Date(),
      });
      if (count === 0) {
        throw new ConflictException('Sourcing candidate state changed concurrently');
      }
      // 후보를 거절하면 그 초안도 더 쓰지 않는다(KID-310). 같은 트랜잭션에서 내린다 — 거절만
      // 커밋되고 초안이 살아 있으면 그 어긋남이 어느 화면에도 보이지 않는다.
      // 몰에 올라가 있으면 초안은 그대로 두고 경고만 돌려준다: 몰에 있는 상품의 기준을 잃으면
      // 수정 · 품절을 어디에 걸지 모른다.
      const draft = await this.salesProductDrafts.retireForSource(ownerTx, organizationId, candidateId);
      return {
        status: 'rejected' as const,
        draftRetired: draft.retired,
        ...(draft.blockedReason ? { draftWarning: draft.blockedReason } : {}),
      };
    });
  }
}
