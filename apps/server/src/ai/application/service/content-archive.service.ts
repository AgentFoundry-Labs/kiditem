import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONTENT_ARCHIVE_REPOSITORY_PORT,
  type ContentArchiveRepositoryPort,
} from '../port/out/repository/content-archive.repository.port';
import {
  buildContentArchiveWorkspaces,
  contentArchiveGenerationItem,
  type ContentArchiveGenerationItem,
  type ContentArchiveListQuery,
  type ContentArchiveWorkspaceItem,
} from './content-archive.read-model';

@Injectable()
export class ContentArchiveService {
  constructor(
    @Inject(CONTENT_ARCHIVE_REPOSITORY_PORT)
    private readonly repository: ContentArchiveRepositoryPort,
  ) {}

  async listWorkspaces(
    organizationId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{
    items: ContentArchiveWorkspaceItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page, limit } = normalizePage(query.page, query.limit);
    const rows = await this.repository.listWorkspaceGenerations({ organizationId, query });
    const workspaces = buildContentArchiveWorkspaces(rows);
    return {
      items: workspaces.slice((page - 1) * limit, page * limit),
      total: workspaces.length,
      page,
      limit,
    };
  }

  async listForSourcingCandidate(
    organizationId: string,
    candidateId: string,
    query: ContentArchiveListQuery = {},
  ): Promise<{
    items: ContentArchiveGenerationItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const candidate = await this.repository.findSourcingCandidate({
      organizationId,
      candidateId,
    });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');
    const { page, limit } = normalizePage(query.page, query.limit);
    const { total, rows } = await this.repository.listSourcingCandidateGenerations({
      organizationId,
      candidateId: candidate.id,
      query,
      page,
      limit,
    });
    return {
      items: rows.map(contentArchiveGenerationItem),
      total,
      page,
      limit,
    };
  }
}

function normalizePage(pageRaw?: number, limitRaw?: number): { page: number; limit: number } {
  const page = Number.isFinite(pageRaw) && pageRaw && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw ? Math.floor(limitRaw) : 24),
  );
  return { page, limit };
}
