import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SOURCING_AI_WORKSPACE_ARCHIVE_PORT,
  type SourcingAiWorkspaceArchivePort,
} from '../port/out/cross-domain/ai-workspace-archive.port';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';

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
  ) {}

  async archive(candidateId: string, organizationId: string): Promise<SourcingWorkspaceArchiveResult> {
    return this.candidates.runInTransaction(async (tx) => {
      const archivedAt = new Date();
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
