import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ContentWorkspaceThumbnailSelectionRepositoryPort,
  ContentWorkspaceThumbnailSelectionSource,
} from '../../../application/port/out/repository/content-workspace-thumbnail-selection.repository.port';

interface ManagedThumbnailAsset {
  id: string;
  url: string;
}

@Injectable()
export class ContentWorkspaceThumbnailSelectionRepositoryAdapter
  implements ContentWorkspaceThumbnailSelectionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async assertActiveWorkspace(input: {
    organizationId: string;
    workspaceId: string;
  }): Promise<void> {
    const workspace = await this.prisma.contentWorkspace.findFirst({
      where: {
        id: input.workspaceId,
        organizationId: input.organizationId,
        status: 'active',
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Content workspace not found.');
  }

  async selectCurrent(input: {
    organizationId: string;
    workspaceId: string;
    userId: string | null;
    selection: ContentWorkspaceThumbnailSelectionSource;
  }): Promise<{ selectionId: string; contentAssetId: string; url: string }> {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.contentWorkspace.findFirst({
        where: {
          id: input.workspaceId,
          organizationId: input.organizationId,
          status: 'active',
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!workspace) throw new NotFoundException('Content workspace not found.');

      const resolved = await this.resolveAsset(tx, input);
      const selection = await tx.contentWorkspaceThumbnailSelection.create({
        data: {
          organizationId: input.organizationId,
          contentWorkspaceId: workspace.id,
          contentAssetId: resolved.asset.id,
          sourceThumbnailGenerationId: resolved.sourceThumbnailGenerationId,
          sourceThumbnailCandidateId: resolved.sourceThumbnailCandidateId,
          createdByUserId: input.userId,
        },
        select: { id: true },
      });
      const update = await tx.contentWorkspace.updateMany({
        where: {
          id: workspace.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { currentThumbnailSelectionId: selection.id },
      });
      if (update.count !== 1) throw new NotFoundException('Content workspace not found.');
      return {
        selectionId: selection.id,
        contentAssetId: resolved.asset.id,
        url: resolved.asset.url,
      };
    });
  }

  private async resolveAsset(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      workspaceId: string;
      userId: string | null;
      selection: ContentWorkspaceThumbnailSelectionSource;
    },
  ): Promise<{
    asset: ManagedThumbnailAsset;
    sourceThumbnailGenerationId: string | null;
    sourceThumbnailCandidateId: string | null;
  }> {
    if (input.selection.kind === 'content_asset') {
      const asset = await tx.contentAsset.findFirst({
        where: {
          id: input.selection.contentAssetId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        select: { id: true, url: true },
      });
      if (!asset) throw new NotFoundException('Managed content asset not found.');
      await lockActiveContentAsset(tx, input.organizationId, asset.id);
      return {
        asset,
        sourceThumbnailGenerationId: null,
        sourceThumbnailCandidateId: null,
      };
    }

    if (input.selection.kind === 'generation_candidate') {
      const generationId = input.selection.sourceThumbnailGenerationId;
      const candidateId = input.selection.sourceThumbnailCandidateId;
      const generationLocked = await lockSuccessfulThumbnailGeneration(tx, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        generationId,
      });
      if (!generationLocked) {
        throw new BadRequestException('Thumbnail candidate is not a successful workspace generation.');
      }
      const candidateLocked = await lockThumbnailGenerationCandidate(tx, {
        organizationId: input.organizationId,
        generationId,
        candidateId,
      });
      if (!candidateLocked) {
        throw new BadRequestException('Thumbnail candidate is not a successful workspace generation.');
      }
      const candidate = await tx.thumbnailGenerationCandidate.findFirst({
        where: {
          id: candidateId,
          organizationId: input.organizationId,
          generationId,
        },
        select: {
          id: true,
          url: true,
          storageKey: true,
          mimeType: true,
          width: true,
          height: true,
          fileSize: true,
        },
      });
      if (!candidate) {
        throw new BadRequestException('Thumbnail candidate is not a successful workspace generation.');
      }
      const asset = await this.ensureAsset(tx, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        createdByUserId: input.userId,
        url: candidate.url,
        storageKey: candidate.storageKey,
        mimeType: candidate.mimeType,
        width: candidate.width,
        height: candidate.height,
        fileSize: candidate.fileSize,
      });
      await lockActiveContentAsset(tx, input.organizationId, asset.id);
      return {
        asset,
        sourceThumbnailGenerationId: generationId,
        sourceThumbnailCandidateId: candidate.id,
      };
    }

    const asset = await this.ensureAsset(tx, {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      createdByUserId: input.userId,
      url: input.selection.url,
      storageKey: input.selection.storageKey,
      mimeType: input.selection.mimeType,
      width: null,
      height: null,
      fileSize: input.selection.fileSize,
    });
    await lockActiveContentAsset(tx, input.organizationId, asset.id);
    return {
      asset,
      sourceThumbnailGenerationId: null,
      sourceThumbnailCandidateId: null,
    };
  }

  private async ensureAsset(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      workspaceId: string;
      createdByUserId: string | null;
      url: string;
      storageKey: string | null;
      mimeType: string | null;
      width: number | null;
      height: number | null;
      fileSize: number | null;
    },
  ): Promise<ManagedThumbnailAsset> {
    const existing = await tx.contentAsset.findFirst({
      where: { organizationId: input.organizationId, url: input.url, isDeleted: false },
      select: { id: true, url: true },
    });
    if (existing) return existing;
    let group = await tx.contentGenerationGroup.findFirst({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.workspaceId,
        groupType: 'workspace_assets',
      },
      select: { id: true },
    });
    group ??= await tx.contentGenerationGroup.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.workspaceId,
        groupType: 'workspace_assets',
        title: 'Workspace managed assets',
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    return tx.contentAsset.create({
      data: {
        organizationId: input.organizationId,
        generationGroupId: group.id,
        originGenerationGroupId: group.id,
        createdByUserId: input.createdByUserId,
        assetKey: managedAssetKey(input.url),
        url: input.url,
        storageKey: input.storageKey,
        assetType: 'image',
        role: 'thumbnail',
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        fileSize: input.fileSize,
      },
      select: { id: true, url: true },
    });
  }
}

function managedAssetKey(url: string): string {
  return `managed-url:${createHash('sha256').update(url).digest('hex')}`;
}

async function lockActiveContentAsset(
  tx: Prisma.TransactionClient,
  organizationId: string,
  contentAssetId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM content_assets
    WHERE id = ${contentAssetId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND is_deleted = false
    FOR UPDATE
  `);
  if (rows.length !== 1) {
    throw new NotFoundException('Managed content asset not found.');
  }
}

async function lockSuccessfulThumbnailGeneration(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; workspaceId: string; generationId: string },
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM thumbnail_generations
    WHERE id = ${input.generationId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND content_workspace_id = ${input.workspaceId}::uuid
      AND status = 'succeeded'
      AND is_deleted = false
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function lockThumbnailGenerationCandidate(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; generationId: string; candidateId: string },
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM thumbnail_generation_candidates
    WHERE id = ${input.candidateId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND generation_id = ${input.generationId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}
