import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** 이 상세페이지가 AI 가 만든 것이 아니라 밖에서 가져와 올린 것임을 적는 표시. */
const UPLOADED_DETAIL_PAGE_SOURCE = 'uploaded_detail_page';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  type ContentAssetLibraryRepositoryPort,
} from '../../../application/port/out/repository/content-asset-library.repository.port';
import type {
  CandidateDetailPageHtmlSnapshot,
  DetailPageDuplicateSourceSnapshot,
  DetailPageGenerationSnapshot,
  DetailPageListRepositoryInput,
  DetailPageQueryRepositoryPort,
} from '../../../application/port/out/repository/detail-page-query.repository.port';
import { DETAIL_PAGE_REVISION_TYPE } from '../../../domain/detail-page/detail-page-revision-type';

interface DetailPageEditableGenerationSnapshot {
  id: string;
  generationGroupId: string;
  contentWorkspaceId: string;
  detailPageArtifactId: string | null;
  generatedTitle: string | null;
  triggeredByUserId: string | null;
}

@Injectable()
export class DetailPageQueryRepositoryAdapter implements DetailPageQueryRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_ASSET_LIBRARY_REPOSITORY_PORT)
    private readonly contentAssets: ContentAssetLibraryRepositoryPort,
  ) {}

  /**
   * 후보의 "현재 상세페이지" HTML 1건.
   *
   * 우선순위는 워크스페이스의 리비전 포인터(`currentDetailPageRevisionId`), 현재 아티팩트
   * 포인터(`currentDetailPageArtifactId`)의 `currentRevisionId`, 최신 아티팩트 순이다.
   * 모두 같은 "저장된 상세페이지" 계약이라 서로 대체 가능하지만, 그 밖의 무엇으로도 대체하지 않는다.
   * (생성 결과 스냅샷·썸네일·수집 원본으로 폴백하면 엉뚱한 상세페이지가 등록된다.)
   */
  async findWorkspaceCurrentDetailPageHtml(input: {
    contentWorkspaceId: string;
    organizationId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null> {
    const revisionSelect = {
      id: true,
      artifactId: true,
      html: true,
      createdAt: true,
    } as const;

    const workspace = await this.prisma.contentWorkspace.findFirst({
      where: {
        id: input.contentWorkspaceId,
        organizationId: input.organizationId,
        status: 'active',
        isDeleted: false,
      },
      select: {
        currentDetailPageRevision: { select: revisionSelect },
        currentDetailPageArtifact: {
          select: { currentRevision: { select: revisionSelect } },
        },
        detailPageArtifacts: {
          where: {
            organizationId: input.organizationId,
            isDeleted: false,
            currentRevisionId: { not: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { currentRevision: { select: revisionSelect } },
        },
      },
    });
    if (!workspace) return null;

    const revision =
      workspace.currentDetailPageRevision
      ?? workspace.currentDetailPageArtifact?.currentRevision
      ?? workspace.detailPageArtifacts[0]?.currentRevision
      ?? null;
    if (!revision) return null;

    return {
      revisionId: revision.id,
      artifactId: revision.artifactId,
      html: revision.html,
      createdAt: revision.createdAt,
    };
  }

  async findWorkspaceDetailPageRevisionHtml(input: {
    organizationId: string;
    contentWorkspaceId: string;
    revisionId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null> {
    const revision = await this.prisma.detailPageRevision.findFirst({
      where: {
        id: input.revisionId,
        organizationId: input.organizationId,
        artifact: {
          organizationId: input.organizationId,
          contentWorkspaceId: input.contentWorkspaceId,
          isDeleted: false,
          contentWorkspace: { status: 'active', isDeleted: false },
        },
      },
      select: { id: true, artifactId: true, html: true, createdAt: true },
    });
    if (!revision) return null;
    return { revisionId: revision.id, artifactId: revision.artifactId, html: revision.html, createdAt: revision.createdAt };
  }

  async findDetailPageRevisionHtml(input: {
    organizationId: string;
    revisionId: string;
    artifactId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null> {
    const revision = await this.prisma.detailPageRevision.findFirst({
      where: {
        id: input.revisionId,
        artifactId: input.artifactId,
        organizationId: input.organizationId,
        artifact: {
          organizationId: input.organizationId,
          isDeleted: false,
        },
      },
      select: {
        id: true,
        artifactId: true,
        html: true,
        createdAt: true,
      },
    });
    if (!revision) return null;
    return {
      revisionId: revision.id,
      artifactId: revision.artifactId,
      html: revision.html,
      createdAt: revision.createdAt,
    };
  }
}
