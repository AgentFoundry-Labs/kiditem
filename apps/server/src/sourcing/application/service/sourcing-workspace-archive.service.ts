import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftPort,
} from '../port/out/cross-domain/sales-product-draft.port';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  CANDIDATE_REGISTRATION_PORT,
  type CandidateRegistrationPort,
} from '../../../channels/application/port/in/candidate-registration.port';
import {
  REGISTRATION_EXECUTION_PORT,
  type RegistrationExecutionPort,
} from '../../../channels/application/port/in/capability/registration-execution.port';

export interface SourcingWorkspaceArchiveResult {
  ok: true;
  archivedCandidateImages: number;
  /** 그 후보의 판매상품 초안을 `unused` 로 내렸는가. 초안이 없으면 undefined. */
  draftRetired?: boolean;
  /** 내리지 못한 이유(몰에 올라가 있다). 후보 삭제 자체는 막지 않는다. */
  draftWarning?: string;
}

@Injectable()
export class SourcingWorkspaceArchiveService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(CANDIDATE_REGISTRATION_PORT)
    private readonly preparations: CandidateRegistrationPort,
    @Inject(REGISTRATION_EXECUTION_PORT)
    private readonly executions: RegistrationExecutionPort,
    @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly salesProductDrafts: SalesProductDraftPort,
  ) {}

  async archive(candidateId: string, organizationId: string): Promise<SourcingWorkspaceArchiveResult> {
    return this.candidates.runInTransaction(async (tx, ownerTx) => {
      const archivedAt = new Date();
      await this.candidates.lockCandidate(tx, {
        id: candidateId,
        organizationId,
      });
      const locked = await this.candidates.findCandidateState(tx, {
        id: candidateId,
        organizationId,
      });
      if (!locked || locked.status !== 'sourced') {
        throw new NotFoundException('Sourcing candidate not found');
      }
      // 실행 행은 Channels 것이다. 후보 삭제 준비도 그쪽 울타리가 하고, 우리
      // 트랜잭션을 넘겨 후보 종료와 한 커밋에 들어가게 한다(ADR-0014).
      await this.executions.cancelUnstartedExecutions(
        ownerTx,
        { organizationId, sourceCandidateId: candidateId, cancelledAt: archivedAt },
      );
      await this.preparations.assertCandidateTerminalTransitionAllowed(ownerTx, {
        organizationId,
        sourceCandidateId: candidateId,
      });
      const candidate = await this.candidates.archiveSourcedWorkspace(tx, {
        id: candidateId,
        organizationId,
        archivedAt,
      });
      if (!candidate.archivedCandidate) {
        throw new NotFoundException('Sourcing candidate not found');
      }

      // 후보를 지우면 그 초안도 더 쓰지 않는다(KID-310). 콘텐츠 작업공간은 초안 소유라
      // 초안을 내리는 쪽(Channels)이 AI 계약으로 함께 보관한다 — 여기서 AI 행을 쓰지 않는다.
      // 같은 트랜잭션이라 후보만 지워지고 초안이 남는 중간 상태가 없다.
      const draft = await this.salesProductDrafts.retireForSource(ownerTx, organizationId, candidateId);
      return {
        ok: true as const,
        archivedCandidateImages: candidate.archivedCandidateImages,
        draftRetired: draft.retired,
        ...(draft.blockedReason ? { draftWarning: draft.blockedReason } : {}),
      };
    });
  }
}
