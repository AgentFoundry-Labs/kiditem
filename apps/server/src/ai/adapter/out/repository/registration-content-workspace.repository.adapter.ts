import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  RegistrationContentSelectionInput,
  ResolvedRegistrationContentSelections,
} from '../../../application/port/in/workspace/registration-content-workspace.port';
import type {
  RegistrationContentWorkspaceRepositoryPort,
} from '../../../application/port/out/repository/registration-content-workspace.repository.port';

@Injectable()
export class RegistrationContentWorkspaceRepositoryAdapter
  implements RegistrationContentWorkspaceRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async resolveSourceSelections(
    transaction: object,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections> {
    const tx = transaction as Prisma.TransactionClient;
    const source = await this.findSourceWorkspace(tx, input);

    let artifactId = input.selectedDetailPageArtifactId;
    if (input.selectedDetailPageGenerationId) {
      const generation = await tx.contentGeneration.findFirst({
        where: {
          id: input.selectedDetailPageGenerationId,
          organizationId: input.organizationId,
          contentWorkspaceId: source.id,
          status: { in: ['READY', 'completed'] },
          isDeleted: false,
        },
        select: { id: true, detailPageArtifactId: true },
      });
      if (!generation?.detailPageArtifactId) {
        throw new BadRequestException(
          'Selected detail generation is not successful source content.',
        );
      }
      if (artifactId && generation.detailPageArtifactId !== artifactId) {
        throw new BadRequestException(
          'Selected detail generation does not own the selected artifact.',
        );
      }
      artifactId = generation.detailPageArtifactId;
    }

    if (input.selectedDetailPageRevisionId && !artifactId) {
      throw new BadRequestException(
        'Selected detail revision has no source-owned artifact.',
      );
    }

    let revisionId = input.selectedDetailPageRevisionId;
    if (artifactId) {
      const artifact = await tx.detailPageArtifact.findFirst({
        where: {
          id: artifactId,
          organizationId: input.organizationId,
          contentWorkspaceId: source.id,
          isDeleted: false,
        },
        select: { id: true, currentRevisionId: true },
      });
      if (!artifact) {
        throw new BadRequestException('Selected detail artifact is not source-owned.');
      }
      revisionId ??= artifact.currentRevisionId;
    }

    if (revisionId) {
      const revision = await tx.detailPageRevision.findFirst({
        where: {
          id: revisionId,
          organizationId: input.organizationId,
          artifactId: artifactId!,
        },
        select: { id: true },
      });
      if (!revision) {
        throw new BadRequestException('Selected detail revision is not source-owned.');
      }
    }

    await this.validateThumbnailSelection(tx, input, source.id);
    return {
      selectedThumbnailUrl: input.selectedThumbnailUrl,
      selectedThumbnailGenerationId: input.selectedThumbnailGenerationId,
      selectedThumbnailGenerationCandidateId:
        input.selectedThumbnailGenerationCandidateId,
      selectedDetailPageArtifactId: artifactId,
      selectedDetailPageRevisionId: revisionId,
      selectedDetailPageGenerationId: input.selectedDetailPageGenerationId,
    };
  }

  async validateSourceSelections(
    transaction: object | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void> {
    await this.validateSourceSelectionsTx(
      (transaction ?? this.prisma) as Prisma.TransactionClient,
      input,
    );
  }

  async ensureCandidateWorkspace(
    transaction: object,
    input: {
      organizationId: string;
      sourceCandidateId: string;
      displayName: string;
      normalizedTitle: string;
      createdByUserId: string | null;
    },
  ): Promise<{ workspaceId: string }> {
    const tx = transaction as Prisma.TransactionClient;
    const candidate = await tx.sourcingCandidate.findFirst({
      where: {
        id: input.sourceCandidateId,
        organizationId: input.organizationId,
        status: 'sourced',
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Sourcing candidate not found.');
    const existing = await tx.contentWorkspace.findFirst({
      where: {
        organizationId: input.organizationId,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: input.sourceCandidateId,
        status: 'active',
        isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) return { workspaceId: existing.id };
    const created = await tx.contentWorkspace.create({
      data: {
        organizationId: input.organizationId,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: input.sourceCandidateId,
        targetMasterId: null,
        channelListingId: null,
        originWorkspaceId: null,
        displayName: input.displayName,
        normalizedTitle: input.normalizedTitle,
        status: 'active',
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    return { workspaceId: created.id };
  }

  async branchToListing(
    transaction: object,
    input: {
      organizationId: string;
      sourceWorkspaceId: string;
      listingId: string;
      displayName: string;
      normalizedTitle: string;
      createdByUserId: string | null;
      selectedThumbnailUrl: string | null;
      selectedThumbnailGenerationId: string | null;
      selectedThumbnailGenerationCandidateId: string | null;
      selectedDetailPageArtifactId: string | null;
      selectedDetailPageRevisionId: string | null;
      selectedDetailPageGenerationId: string | null;
    },
  ): Promise<{ workspaceId: string }> {
    const tx = transaction as Prisma.TransactionClient;
    const source = await this.validateSourceSelectionsTx(tx, input);
    const listingRows = await tx.$queryRaw<Array<{
      id: string;
      sourceCandidateId: string | null;
    }>>(Prisma.sql`
      SELECT id, source_candidate_id AS "sourceCandidateId"
      FROM channel_listings
      WHERE id = ${input.listingId}::uuid
        AND organization_id = ${input.organizationId}::uuid
        AND is_deleted = false
      FOR UPDATE
    `);
    const listing = listingRows[0];
    if (!listing || listingRows.length !== 1) {
      throw new NotFoundException('Channel listing not found.');
    }
    if (!source.sourceCandidateId
      || listing.sourceCandidateId !== source.sourceCandidateId) {
      throw new ConflictException(
        'Channel listing and source workspace have different candidates.',
      );
    }

    const existingRows = await tx.$queryRaw<Array<{
      id: string;
      originWorkspaceId: string | null;
      currentDetailPageArtifactId: string | null;
      currentDetailPageRevisionId: string | null;
      currentThumbnailSelectionId: string | null;
    }>>(Prisma.sql`
      SELECT
        id,
        origin_workspace_id AS "originWorkspaceId",
        current_detail_page_artifact_id AS "currentDetailPageArtifactId",
        current_detail_page_revision_id AS "currentDetailPageRevisionId",
        current_thumbnail_selection_id AS "currentThumbnailSelectionId"
      FROM content_workspaces
      WHERE organization_id = ${input.organizationId}::uuid
        AND owner_type = 'channel_listing'
        AND channel_listing_id = ${input.listingId}::uuid
        AND status = 'active'
        AND is_deleted = false
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
      FOR UPDATE
    `);
    const existing = existingRows[0] ?? null;
    let workspace: { id: string };
    if (existing) {
      if (existing.originWorkspaceId
        && existing.originWorkspaceId !== source.id) {
        throw new ConflictException(
          'Listing workspace belongs to a different source workspace.',
        );
      }
      const hasContent = Boolean(
        existing.currentDetailPageArtifactId
        || existing.currentDetailPageRevisionId
        || existing.currentThumbnailSelectionId,
      );
      if (existing.originWorkspaceId === source.id && hasContent) {
        return { workspaceId: existing.id };
      }
      if (!existing.originWorkspaceId && hasContent) {
        throw new ConflictException(
          'Existing listing workspace already contains unrelated content.',
        );
      }
      if (!existing.originWorkspaceId) {
        const claimed = await tx.contentWorkspace.updateMany({
          where: {
            id: existing.id,
            organizationId: input.organizationId,
            originWorkspaceId: null,
            currentDetailPageArtifactId: null,
            currentDetailPageRevisionId: null,
            currentThumbnailSelectionId: null,
            status: 'active',
            isDeleted: false,
          },
          data: { originWorkspaceId: source.id },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Existing listing workspace changed while content was being assigned.',
          );
        }
      }
      workspace = { id: existing.id };
    } else {
      workspace = await tx.contentWorkspace.create({
        data: {
          organizationId: input.organizationId,
          ownerType: 'channel_listing',
          sourceCandidateId: null,
          targetMasterId: null,
          channelListingId: input.listingId,
          originWorkspaceId: source.id,
          displayName: input.displayName,
          normalizedTitle: input.normalizedTitle,
          status: 'active',
          createdByUserId: input.createdByUserId,
        },
        select: { id: true },
      });
    }

    const detail = await this.cloneDetailSelection(tx, {
      ...input,
      sourceArtifactId: input.selectedDetailPageArtifactId,
      sourceRevisionId: input.selectedDetailPageRevisionId,
      listingWorkspaceId: workspace.id,
    });
    const thumbnail = await this.cloneThumbnailSelection(tx, {
      ...input,
      sourceWorkspaceId: source.id,
      listingWorkspaceId: workspace.id,
    });

    if (detail || thumbnail) {
      const updated = await tx.contentWorkspace.updateMany({
        where: {
          id: workspace.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: {
          ...(detail
            ? {
                currentDetailPageArtifactId: detail.artifactId,
                currentDetailPageRevisionId: detail.revisionId,
              }
            : {}),
          ...(thumbnail
            ? { currentThumbnailSelectionId: thumbnail.selectionId }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Listing workspace changed before selected content was assigned.',
        );
      }
    }
    return { workspaceId: workspace.id };
  }

  private async validateSourceSelectionsTx(
    tx: Prisma.TransactionClient,
    input: RegistrationContentSelectionInput,
  ): Promise<{
    id: string;
    sourceCandidateId: string | null;
  }> {
    const source = await this.findSourceWorkspace(tx, input);

    const artifactId = input.selectedDetailPageArtifactId;
    if (input.selectedDetailPageRevisionId && !artifactId) {
      throw new BadRequestException('Selected detail revision has no source-owned artifact.');
    }
    if (artifactId) {
      const artifact = await tx.detailPageArtifact.findFirst({
        where: {
          id: artifactId,
          organizationId: input.organizationId,
          contentWorkspaceId: source.id,
          isDeleted: false,
        },
        select: { id: true },
      });
      if (!artifact) {
        throw new BadRequestException('Selected detail artifact is not source-owned.');
      }
    }
    if (input.selectedDetailPageRevisionId) {
      const revision = await tx.detailPageRevision.findFirst({
        where: {
          id: input.selectedDetailPageRevisionId,
          organizationId: input.organizationId,
          artifactId: artifactId!,
        },
        select: { id: true },
      });
      if (!revision) {
        throw new BadRequestException('Selected detail revision is not source-owned.');
      }
    }
    if (input.selectedDetailPageGenerationId) {
      const generation = await tx.contentGeneration.findFirst({
        where: {
          id: input.selectedDetailPageGenerationId,
          organizationId: input.organizationId,
          contentWorkspaceId: source.id,
          status: { in: ['READY', 'completed'] },
          isDeleted: false,
        },
        select: { id: true, detailPageArtifactId: true },
      });
      if (!generation || !generation.detailPageArtifactId) {
        throw new BadRequestException('Selected detail generation is not successful source content.');
      }
      if (!artifactId || generation.detailPageArtifactId !== artifactId) {
        throw new BadRequestException('Selected detail generation does not own the selected artifact.');
      }
    }

    await this.validateThumbnailSelection(tx, input, source.id);
    return source;
  }

  private async findSourceWorkspace(
    tx: Prisma.TransactionClient,
    input: Pick<RegistrationContentSelectionInput, 'organizationId' | 'sourceWorkspaceId'>,
  ): Promise<{ id: string; sourceCandidateId: string | null }> {
    const source = await tx.contentWorkspace.findFirst({
      where: {
        id: input.sourceWorkspaceId,
        organizationId: input.organizationId,
        ownerType: 'sourcing_candidate',
        status: 'active',
        isDeleted: false,
      },
      select: { id: true, sourceCandidateId: true },
    });
    if (!source) throw new NotFoundException('Source content workspace not found.');
    return source;
  }

  private async validateThumbnailSelection(
    tx: Prisma.TransactionClient,
    input: RegistrationContentSelectionInput,
    sourceWorkspaceId: string,
  ): Promise<void> {
    const hasThumbnailGeneration = Boolean(
      input.selectedThumbnailGenerationId
      || input.selectedThumbnailGenerationCandidateId,
    );
    if (!input.selectedThumbnailUrl) {
      if (hasThumbnailGeneration) {
        throw new BadRequestException(
          'Selected thumbnail URL is required with generation provenance.',
        );
      }
      return;
    }
    if (hasThumbnailGeneration) {
      if (!input.selectedThumbnailGenerationId
        || !input.selectedThumbnailGenerationCandidateId) {
        throw new BadRequestException('Thumbnail generation provenance must be complete.');
      }
      const [generation, candidate] = await Promise.all([
        tx.thumbnailGeneration.findFirst({
          where: {
            id: input.selectedThumbnailGenerationId,
            organizationId: input.organizationId,
            contentWorkspaceId: sourceWorkspaceId,
            status: 'succeeded',
            isDeleted: false,
          },
          select: { id: true },
        }),
        tx.thumbnailGenerationCandidate.findFirst({
          where: {
            id: input.selectedThumbnailGenerationCandidateId,
            organizationId: input.organizationId,
            generationId: input.selectedThumbnailGenerationId,
            url: input.selectedThumbnailUrl,
          },
          select: { id: true },
        }),
      ]);
      if (!generation || !candidate) {
        throw new BadRequestException(
          'Selected thumbnail generation is not successful source content.',
        );
      }
      return;
    }

    const asset = await tx.contentAsset.findFirst({
      where: {
        organizationId: input.organizationId,
        url: input.selectedThumbnailUrl,
        isDeleted: false,
        thumbnailSelections: {
          some: {
            organizationId: input.organizationId,
            contentWorkspaceId: sourceWorkspaceId,
          },
        },
      },
      select: { id: true },
    });
    if (!asset) {
      throw new BadRequestException(
        'Selected thumbnail URL is not source-owned managed content.',
      );
    }
  }

  private async cloneDetailSelection(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      sourceWorkspaceId: string;
      listingWorkspaceId: string;
      sourceArtifactId: string | null;
      sourceRevisionId: string | null;
      createdByUserId: string | null;
    },
  ): Promise<{ artifactId: string; revisionId: string | null } | null> {
    if (!input.sourceArtifactId) return null;
    const artifact = await tx.detailPageArtifact.findFirst({
      where: {
        id: input.sourceArtifactId,
        organizationId: input.organizationId,
        contentWorkspaceId: input.sourceWorkspaceId,
        isDeleted: false,
      },
      select: {
        id: true,
        title: true,
        status: true,
        metadata: true,
      },
    });
    if (!artifact) throw new BadRequestException('Selected detail artifact is not source-owned.');
    const revisionId = input.sourceRevisionId;
    const revision = revisionId
      ? await tx.detailPageRevision.findFirst({
          where: {
            id: revisionId,
            organizationId: input.organizationId,
            artifactId: artifact.id,
          },
          select: {
            id: true,
            revisionType: true,
            html: true,
            assetUrlMap: true,
            imageUrls: true,
          },
        })
      : null;
    if (revisionId && !revision) {
      throw new BadRequestException('Selected detail revision is not source-owned.');
    }

    const clonedArtifact = await tx.detailPageArtifact.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.listingWorkspaceId,
        sourceCandidateId: null,
        targetMasterId: null,
        sourceContentGenerationId: null,
        title: artifact.title,
        status: artifact.status,
        metadata: artifact.metadata as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    if (!revision) return { artifactId: clonedArtifact.id, revisionId: null };
    const clonedRevision = await tx.detailPageRevision.create({
      data: {
        organizationId: input.organizationId,
        artifactId: clonedArtifact.id,
        contentGenerationId: null,
        revisionType: revision.revisionType,
        html: revision.html,
        assetUrlMap: revision.assetUrlMap as Prisma.InputJsonValue,
        imageUrls: revision.imageUrls as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    await tx.detailPageArtifact.updateMany({
      where: {
        id: clonedArtifact.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: { currentRevisionId: clonedRevision.id },
    });
    return { artifactId: clonedArtifact.id, revisionId: clonedRevision.id };
  }

  private async cloneThumbnailSelection(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      sourceWorkspaceId: string;
      listingWorkspaceId: string;
      selectedThumbnailUrl: string | null;
      selectedThumbnailGenerationId: string | null;
      selectedThumbnailGenerationCandidateId: string | null;
      createdByUserId: string | null;
    },
  ): Promise<{ selectionId: string } | null> {
    if (!input.selectedThumbnailUrl) return null;
    const hasGeneration = Boolean(
      input.selectedThumbnailGenerationId || input.selectedThumbnailGenerationCandidateId,
    );
    if (hasGeneration &&
      (!input.selectedThumbnailGenerationId || !input.selectedThumbnailGenerationCandidateId)) {
      throw new BadRequestException('Thumbnail generation provenance must be complete.');
    }
    let asset: { id: string; url: string };
    if (hasGeneration) {
      const generation = await tx.thumbnailGeneration.findFirst({
        where: {
          id: input.selectedThumbnailGenerationId!,
          organizationId: input.organizationId,
          contentWorkspaceId: input.sourceWorkspaceId,
          status: 'succeeded',
          isDeleted: false,
        },
        select: { id: true },
      });
      const candidate = await tx.thumbnailGenerationCandidate.findFirst({
        where: {
          id: input.selectedThumbnailGenerationCandidateId!,
          organizationId: input.organizationId,
          generationId: input.selectedThumbnailGenerationId!,
          url: input.selectedThumbnailUrl,
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
      if (!generation || !candidate) {
        throw new BadRequestException('Selected thumbnail generation is not successful source content.');
      }
      asset = await this.ensureCandidateAsset(tx, {
        organizationId: input.organizationId,
        workspaceId: input.sourceWorkspaceId,
        createdByUserId: input.createdByUserId,
        ...candidate,
      });
    } else {
      const sourceAsset = await tx.contentAsset.findFirst({
        where: {
          organizationId: input.organizationId,
          url: input.selectedThumbnailUrl,
          isDeleted: false,
          thumbnailSelections: {
            some: {
              organizationId: input.organizationId,
              contentWorkspaceId: input.sourceWorkspaceId,
            },
          },
        },
        select: { id: true, url: true },
      });
      if (!sourceAsset) {
        throw new BadRequestException('Selected thumbnail URL is not source-owned managed content.');
      }
      asset = sourceAsset;
    }
    await lockActiveContentAsset(tx, input.organizationId, asset.id);
    const selection = await tx.contentWorkspaceThumbnailSelection.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: input.listingWorkspaceId,
        contentAssetId: asset.id,
        sourceThumbnailGenerationId: input.selectedThumbnailGenerationId,
        sourceThumbnailCandidateId: input.selectedThumbnailGenerationCandidateId,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    return { selectionId: selection.id };
  }

  private async ensureCandidateAsset(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      workspaceId: string;
      url: string;
      storageKey: string | null;
      mimeType: string | null;
      width: number | null;
      height: number | null;
      fileSize: number | null;
      createdByUserId: string | null;
    },
  ): Promise<{ id: string; url: string }> {
    const existing = await tx.contentAsset.findFirst({
      where: {
        organizationId: input.organizationId,
        url: input.url,
        isDeleted: false,
      },
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
    throw new BadRequestException('Selected thumbnail asset is no longer available.');
  }
}
