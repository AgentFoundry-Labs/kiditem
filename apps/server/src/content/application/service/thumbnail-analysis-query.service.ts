import { Inject, Injectable } from '@nestjs/common';
import type { ThumbnailAnalysisListResponse, ThumbnailAnalysisSummary } from '@kiditem/shared/ai';
import { buildAnalysisListResponse, buildAnalysisSummary } from '../../mapper/thumbnail-analysis.mapper';
import {
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  type ThumbnailAnalysisRepositoryPort,
} from '../port/out/repository/thumbnail-analysis.repository.port';

/**
 * Read-only reader for ThumbnailAnalysis list / summary surfaces. Scoped to
 * workspaces with a non-deleted Coupang listing — non-Coupang workspaces never
 * surface in the AI thumbnail UI.
 */
@Injectable()
export class ThumbnailAnalysisQueryService {
  constructor(
    @Inject(THUMBNAIL_ANALYSIS_REPOSITORY_PORT)
    private readonly repository: ThumbnailAnalysisRepositoryPort,
  ) {}

  async findAllWithAnalysis(organizationId: string): Promise<ThumbnailAnalysisListResponse> {
    const [workspaces, analyses] = await Promise.all([
      this.repository.findAllAnalysisWorkspaces(organizationId),
      this.repository.findAnalysesForOrganization(organizationId),
    ]);

    return buildAnalysisListResponse(workspaces, analyses);
  }

  async getSummary(organizationId: string): Promise<ThumbnailAnalysisSummary> {
    const summaryRows = await this.repository.getAnalysisSummaryRows(organizationId);
    return buildAnalysisSummary(summaryRows.workspaceCount, summaryRows.rows);
  }
}
