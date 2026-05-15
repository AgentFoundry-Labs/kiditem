import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  type AiWorkspaceArchivePort,
} from '../../../ai/application/port/in/sourcing-workspace-archive.port';
import {
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/sourcing-candidate.repository.port';

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
    private readonly prisma: PrismaService,
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(AI_WORKSPACE_ARCHIVE_PORT)
    private readonly aiArchive: AiWorkspaceArchivePort,
  ) {}

  async archive(candidateId: string, organizationId: string): Promise<SourcingWorkspaceArchiveResult> {
    return this.prisma.$transaction(async (tx) => {
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
