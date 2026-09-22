import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
  type SourcingAiWorkspaceArchivePort,
} from '../port/out/cross-domain/ai-workspace-archive.port';
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
  archivedContentGenerations: number;
  archivedDetailPageArtifacts: number;
  archivedContentAssets: number;
  archivedThumbnailGenerations: number;
}

@Injectable()
export class SourcingWorkspaceArchiveService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_AI_WORKSPACE_ARCHIVE_PORT)
    private readonly aiArchive: SourcingAiWorkspaceArchivePort,
    @Inject(CANDIDATE_REGISTRATION_PORT)
    private readonly preparations: CandidateRegistrationPort,
    @Inject(REGISTRATION_EXECUTION_PORT)
    private readonly executions: RegistrationExecutionPort,
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

      const ai = await this.aiArchive.archiveSourcingWorkspace(tx, {
        organizationId,
        sourceCandidateId: candidateId,
        archivedAt,
      });

      return {
        ok: true,
        archivedCandidateImages: candidate.archivedCandidateImages,
        ...ai,
      };
    });
  }
}
