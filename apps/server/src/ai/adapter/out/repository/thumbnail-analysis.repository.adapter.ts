import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type ThumbnailAnalysisRepositoryPort,
  type UpsertThumbnailAnalysisInput,
} from '../../../application/port/out/thumbnail-analysis.repository.port';
import { upsertThumbnailAnalysis } from './thumbnail-analysis.persistence';
import { thumbnailMasterImageSelect } from './thumbnail-master-image-select.preset';

const THUMBNAIL_ANALYSIS_CHANNEL = 'coupang';

function thumbnailAnalysisMasterWhere(organizationId: string): Prisma.MasterProductWhereInput {
  return {
    organizationId,
    isDeleted: false,
    listings: {
      some: {
        organizationId,
        channel: THUMBNAIL_ANALYSIS_CHANNEL,
        isDeleted: false,
      },
    },
  };
}

@Injectable()
export class ThumbnailAnalysisRepositoryAdapter
  implements ThumbnailAnalysisRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  findAllAnalysisMasters(organizationId: string) {
    return this.prisma.masterProduct.findMany({
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
    });
  }

  findAnalysesForOrganization(organizationId: string) {
    return this.prisma.thumbnailAnalysis.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAnalysisSummaryRows(organizationId: string) {
    const masters = await this.prisma.masterProduct.findMany({
      where: thumbnailAnalysisMasterWhere(organizationId),
      select: { id: true },
    });
    if (masters.length === 0) {
      return { masterCount: 0, rows: [] };
    }
    const rows = await this.prisma.thumbnailAnalysis.findMany({
      where: { organizationId, masterId: { in: masters.map((m) => m.id) } },
      select: {
        grade: true,
        complianceGrade: true,
        qualityAnalyzedAt: true,
        complianceAnalyzedAt: true,
      },
    });
    return { masterCount: masters.length, rows };
  }

  findMasterForAnalysis(productId: string, organizationId: string) {
    return this.prisma.masterProduct.findFirst({
      where: { id: productId, organizationId, isDeleted: false },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
        category: true,
        images: thumbnailMasterImageSelect(organizationId),
        createdAt: true,
      },
    });
  }

  findMastersForBatch(productIds: string[], organizationId: string) {
    return this.prisma.masterProduct.findMany({
      where: { id: { in: productIds }, organizationId, isDeleted: false },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
        category: true,
        images: thumbnailMasterImageSelect(organizationId),
        createdAt: true,
      },
    });
  }

  findMastersForPreInspect(productIds: string[] | undefined, organizationId: string) {
    const where: Prisma.MasterProductWhereInput = { organizationId, isDeleted: false };
    if (productIds?.length) where.id = { in: productIds };
    return this.prisma.masterProduct.findMany({
      where,
      select: {
        id: true,
        imageUrl: true,
        thumbnailUrl: true,
        images: thumbnailMasterImageSelect(organizationId),
      },
    });
  }

  upsertAnalysis(input: UpsertThumbnailAnalysisInput) {
    return upsertThumbnailAnalysis(this.prisma, input);
  }

  findRecomposeMaster(productId: string, organizationId: string) {
    return this.prisma.masterProduct.findFirst({
      where: { id: productId, organizationId, isDeleted: false },
      select: {
        name: true,
        category: true,
        imageUrl: true,
        thumbnailUrl: true,
        images: thumbnailMasterImageSelect(organizationId),
      },
    });
  }
}
