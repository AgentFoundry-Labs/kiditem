import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
} from '../../../application/port/out/repository/content-asset-library.repository.port';
import type {
  DetailPageDuplicateSourceSnapshot,
  DetailPageGenerationSnapshot,
  DetailPageListRepositoryInput,
  DetailPageQueryRepositoryPort,
} from '../../../application/port/out/repository/detail-page-query.repository.port';

interface DetailPageEditableGenerationSnapshot {
  id: string;
  generationGroupId: string;
  contentWorkspaceId: string;
  detailPageArtifactId: string | null;
  generatedTitle: string | null;
  sourceCandidateId: string | null;
  triggeredByUserId: string | null;
}

@Injectable()
export class DetailPageQueryRepositoryAdapter implements DetailPageQueryRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly contentAssets: ContentAssetLibraryRepositoryPort,
  ) {}

  async list(input: DetailPageListRepositoryInput): Promise<DetailPageGenerationSnapshot[]> {
    const ownershipWhere = input.contentWorkspaceId
      ? { contentWorkspaceId: input.contentWorkspaceId }
      : input.sourceCandidateId
        ? { sourceCandidateId: input.sourceCandidateId }
        : {};
    const rows = await this.prisma.contentGeneration.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        contentType: 'detail_page',
        ...ownershipWhere,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows as DetailPageGenerationSnapshot[];
  }

  async findById(input: {
    id: string;
    organizationId: string;
  }): Promise<DetailPageGenerationSnapshot | null> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
    });
    return row as DetailPageGenerationSnapshot | null;
  }

  async existsActive(input: { id: string; organizationId: string }): Promise<boolean> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      select: { id: true },
    });
    return Boolean(row);
  }

  async markDeleted(input: {
    id: string;
    organizationId: string;
    deletedAt: Date;
  }): Promise<void> {
    await this.prisma.contentGeneration.update({
      where: { id: input.id },
      data: { isDeleted: true, deletedAt: input.deletedAt },
    });
  }

  async renameVersion(input: {
    id: string;
    organizationId: string;
    title: string;
  }): Promise<boolean> {
    const row = await this.prisma.contentGeneration.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      select: { id: true, detailPageArtifactId: true },
    });
    if (!row) return false;

    const updated = await this.prisma.contentGeneration.updateMany({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      data: { generatedTitle: input.title },
    });
    if (updated.count === 0) return false;
    if (row.detailPageArtifactId) {
      await this.prisma.detailPageArtifact.updateMany({
        where: {
          id: row.detailPageArtifactId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { title: input.title },
      });
    }
    return true;
  }

  async findDuplicateSource(input: {
    id: string;
    organizationId: string;
  }): Promise<DetailPageDuplicateSourceSnapshot | null> {
    const source = await this.prisma.contentGeneration.findFirst({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
        contentType: 'detail_page',
      },
      select: {
        id: true,
        generationGroupId: true,
        contentWorkspaceId: true,
        sourceCandidateId: true,
        detailPageArtifactId: true,
        contentType: true,
        templateId: true,
        generationInput: true,
        generationResult: true,
        generatedTitle: true,
        generatedDescription: true,
        generatedCopy: true,
        editedHtml: true,
        editedHtmlSavedAt: true,
        status: true,
        triggeredByUserId: true,
        detailPageArtifact: {
          select: {
            id: true,
            title: true,
            currentRevision: {
              select: {
                id: true,
                html: true,
                assetUrlMap: true,
                imageUrls: true,
              },
            },
          },
        },
      },
    });
    return source as DetailPageDuplicateSourceSnapshot | null;
  }

  async duplicateVersion(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    source: DetailPageDuplicateSourceSnapshot;
    duplicateTitle: string;
  }): Promise<DetailPageGenerationSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.contentGeneration.create({
        data: {
          organizationId: input.organizationId,
          contentType: input.source.contentType,
          generationGroupId: input.source.generationGroupId,
          contentWorkspaceId: input.source.contentWorkspaceId,
          sourceCandidateId:
            input.source.sourceCandidateId,
          triggeredByUserId: input.triggeredByUserId ?? input.source.triggeredByUserId,
          templateId: input.source.templateId,
          generationInput: input.source.generationInput as Prisma.InputJsonValue,
          generationResult: input.source.generationResult as Prisma.InputJsonValue,
          generatedTitle: input.duplicateTitle,
          generatedDescription: input.source.generatedDescription,
          generatedCopy: input.source.generatedCopy,
          editedHtml: input.source.editedHtml,
          editedHtmlSavedAt: input.source.editedHtmlSavedAt,
          status: input.source.status === 'FAILED' ? 'READY' : input.source.status,
        },
      });

      const artifact = await tx.detailPageArtifact.create({
        data: {
          organizationId: input.organizationId,
          contentWorkspaceId: input.source.contentWorkspaceId,
          sourceContentGenerationId: created.id,
          title: input.duplicateTitle,
          status: 'draft',
          createdByUserId: input.triggeredByUserId ?? input.source.triggeredByUserId,
          metadata: {
            source: 'detail_page_version_duplicate',
            sourceContentGenerationId: input.source.id,
            sourceDetailPageArtifactId: input.source.detailPageArtifactId,
            sourceDetailPageRevisionId: input.source.detailPageArtifact?.currentRevision?.id ?? null,
          },
        },
        select: { id: true },
      });

      const sourceRevision = input.source.detailPageArtifact?.currentRevision ?? null;
      if (sourceRevision) {
        const revision = await tx.detailPageRevision.create({
          data: {
            organizationId: input.organizationId,
            artifactId: artifact.id,
            contentGenerationId: created.id,
            revisionType: 'duplicate',
            html: sourceRevision.html,
            assetUrlMap: sourceRevision.assetUrlMap as Prisma.InputJsonValue,
            imageUrls: sourceRevision.imageUrls as Prisma.InputJsonValue,
            createdByUserId: input.triggeredByUserId ?? input.source.triggeredByUserId,
          },
          select: { id: true },
        });
        await tx.detailPageArtifact.updateMany({
          where: { id: artifact.id, organizationId: input.organizationId },
          data: { currentRevisionId: revision.id },
        });
      }

      await tx.contentGeneration.updateMany({
        where: { id: created.id, organizationId: input.organizationId },
        data: { detailPageArtifactId: artifact.id },
      });

      return tx.contentGeneration.findFirstOrThrow({
        where: { id: created.id, organizationId: input.organizationId },
      });
    });
  }

  async saveEditedHtmlRevision(input: {
    organizationId: string;
    contentGenerationId: string;
    html: string;
    assetUrlMap: Record<string, string>;
    imageUrls: string[];
    savedAt: Date;
  }): Promise<{ html: string; createdAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.contentGeneration.findFirst({
        where: {
          id: input.contentGenerationId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: {
          id: true,
          generationGroupId: true,
          contentWorkspaceId: true,
          detailPageArtifactId: true,
          generatedTitle: true,
          sourceCandidateId: true,
          triggeredByUserId: true,
        },
      }) as DetailPageEditableGenerationSnapshot | null;
      if (!row) throw new NotFoundException('Detail page generation not found');

      await this.contentAssets.syncGenerationImageUsagesInScope(tx, {
        organizationId: input.organizationId,
        generationGroupId: row.generationGroupId,
        contentGenerationId: input.contentGenerationId,
        createdByUserId: row.triggeredByUserId,
        imageUrls: input.imageUrls,
      });

      const artifactId = row.detailPageArtifactId ?? (await tx.detailPageArtifact.create({
        data: {
          organizationId: input.organizationId,
          contentWorkspaceId: row.contentWorkspaceId,
          sourceContentGenerationId: input.contentGenerationId,
          title: row.generatedTitle ?? '상세페이지',
          status: 'draft',
          createdByUserId: row.triggeredByUserId,
          metadata: { source: 'detail_page_editor_save' },
        },
        select: { id: true },
      })).id;

      const createdRevision = await tx.detailPageRevision.create({
        data: {
          organizationId: input.organizationId,
          artifactId,
          contentGenerationId: input.contentGenerationId,
          revisionType: 'manual_edit',
          html: input.html,
          assetUrlMap: input.assetUrlMap as Prisma.InputJsonValue,
          imageUrls: input.imageUrls as Prisma.InputJsonValue,
          createdByUserId: row.triggeredByUserId,
          createdAt: input.savedAt,
        },
        select: {
          id: true,
          html: true,
          createdAt: true,
        },
      });

      const artifactUpdated = await tx.detailPageArtifact.updateMany({
        where: { id: artifactId, organizationId: input.organizationId },
        data: {
          currentRevisionId: createdRevision.id,
          status: 'draft',
        },
      });
      if (artifactUpdated.count === 0) {
        throw new NotFoundException('Detail page artifact not found');
      }

      const generationUpdated = await tx.contentGeneration.updateMany({
        where: { id: input.contentGenerationId, organizationId: input.organizationId },
        data: { detailPageArtifactId: artifactId },
      });
      if (generationUpdated.count === 0) {
        throw new NotFoundException('Detail page generation not found');
      }

      await tx.contentWorkspace.updateMany({
        where: {
          id: row.contentWorkspaceId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: {
          currentDetailPageArtifactId: artifactId,
          currentDetailPageRevisionId: createdRevision.id,
        },
      });

      return {
        html: createdRevision.html,
        createdAt: createdRevision.createdAt,
      };
    });
  }

  async getEditedHtml(input: { id: string; organizationId: string }) {
    return this.prisma.contentGeneration.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      select: {
        id: true,
        editedHtml: true,
        editedHtmlSavedAt: true,
        detailPageArtifact: {
          select: {
            isDeleted: true,
            currentRevision: {
              select: {
                html: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
  }
}
