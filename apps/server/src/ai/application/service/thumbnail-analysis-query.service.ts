import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ThumbnailAnalysisListResponse,
  ThumbnailAnalysisSummary,
} from '@kiditem/shared/ai';
import { PrismaService } from '../../../prisma/prisma.service';
import { thumbnailMasterImageSelect } from '../../adapter/out/prisma/master-image-select.preset';
import {
  type AnalysisRow,
  type MasterRow,
  buildAnalysisListResponse,
  buildAnalysisSummary,
} from '../../adapter/out/prisma/thumbnail-analysis.query';

const THUMBNAIL_ANALYSIS_CHANNEL = 'coupang';

function thumbnailAnalysisMasterWhere(organizationId: string): Prisma.MasterProductWhereInput {
  return {
    organizationId,
    isDeleted: false,
    pipelineStep: null,
    listings: {
      some: {
        organizationId,
        channel: THUMBNAIL_ANALYSIS_CHANNEL,
        isDeleted: false,
      },
    },
  };
}

/**
 * Read-only reader for ThumbnailAnalysis list / summary surfaces. Scoped to
 * masters with a non-deleted Coupang listing — non-Coupang masters never
 * surface in the AI thumbnail UI.
 */
@Injectable()
export class ThumbnailAnalysisQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithAnalysis(organizationId: string): Promise<ThumbnailAnalysisListResponse> {
    const [masters, analyses] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: thumbnailAnalysisMasterWhere(organizationId),
        select: {
          id: true,
          name: true,
          imageUrl: true,
          thumbnailUrl: true,
          images: thumbnailMasterImageSelect(organizationId),
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.thumbnailAnalysis.findMany({
        where: { organizationId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return buildAnalysisListResponse(
      masters as MasterRow[],
      analyses as AnalysisRow[],
    );
  }

  async getSummary(organizationId: string): Promise<ThumbnailAnalysisSummary> {
    const masters = await this.prisma.masterProduct.findMany({
      where: thumbnailAnalysisMasterWhere(organizationId),
      select: { id: true },
    });
    const analyses = masters.length
      ? await this.prisma.thumbnailAnalysis.findMany({
          where: { organizationId, masterId: { in: masters.map((m) => m.id) } },
          select: {
            grade: true,
            complianceGrade: true,
            qualityAnalyzedAt: true,
            complianceAnalyzedAt: true,
          },
        })
      : [];

    return buildAnalysisSummary(masters.length, analyses);
  }
}
