import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import {
  CHANNEL_LISTING_QUERY_PORT,
  type ChannelListingQueryPort,
} from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import type {
  AttachContentWorkspaceToListingInput,
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings: ChannelListingQueryPort,
  ) {}

  async resolveSourceSelections(
    transaction: OwnerTransaction,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections> {
    const tx = ownerTransactionClient(transaction);
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

    await this.resolveThumbnailSelection(tx, input, source);
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
    transaction: OwnerTransaction | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void> {
    await this.validateSourceSelectionsTx(
      transaction ? ownerTransactionClient(transaction) : this.prisma,
      input,
    );
  }

  async findSalesProductWorkspaceId(input: {
    organizationId: string;
    salesProductId: string;
  }): Promise<string | null> {
    const existing = await this.prisma.contentWorkspace.findFirst({
      where: activeSalesProductWorkspaceWhere(input),
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  async ensureSalesProductWorkspace(
    transaction: OwnerTransaction,
    input: {
      organizationId: string;
      salesProductId: string;
      displayName: string;
      normalizedTitle: string;
      createdByUserId: string | null;
    },
  ): Promise<{ workspaceId: string }> {
    const tx = ownerTransactionClient(transaction);
    const existing = await tx.contentWorkspace.findFirst({
      where: activeSalesProductWorkspaceWhere(input),
      select: { id: true },
    });
    if (existing) return { workspaceId: existing.id };
    const created = await tx.contentWorkspace.create({
      data: {
        organizationId: input.organizationId,
        ownerType: 'sales_product',
        salesProductId: input.salesProductId,
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

  /**
   * One workspace belongs to one draft and, once registered, to that draft's
   * listing. Registration therefore records the listing on the draft's own
   * workspace; nothing is cloned and no second workspace is created.
   */
  async attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }> {
    const tx = ownerTransactionClient(transaction);
    await this.channelListings.lockActiveOwner(transaction, {
      organizationId: input.organizationId,
      listingId: input.listingId,
    });

    const lockedRows = await tx.$queryRaw<Array<{
      id: string;
      channelListingId: string | null;
    }>>(Prisma.sql`
      SELECT id, channel_listing_id AS "channelListingId"
      FROM content_workspaces
      WHERE organization_id = ${input.organizationId}::uuid
        AND sales_product_id = ${input.salesProductId}::uuid
        AND status = 'active'
        AND is_deleted = false
      FOR UPDATE
    `);
    const workspace = lockedRows[0];
    if (!workspace || lockedRows.length !== 1) {
      throw new NotFoundException('Sales product content workspace not found.');
    }
    if (workspace.channelListingId === input.listingId) {
      return { workspaceId: workspace.id };
    }
    if (workspace.channelListingId) {
      throw new ConflictException(
        'Sales product content workspace already belongs to another listing.',
      );
    }

    const claimed = await tx.contentWorkspace.updateMany({
      where: {
        id: workspace.id,
        organizationId: input.organizationId,
        channelListingId: null,
        status: 'active',
        isDeleted: false,
      },
      data: { channelListingId: input.listingId },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Content workspace changed while the listing was being attached.',
      );
    }
    return { workspaceId: workspace.id };
  }

  private async validateSourceSelectionsTx(
    tx: Prisma.TransactionClient,
    input: RegistrationContentSelectionInput,
  ): Promise<{ id: string }> {
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
  ): Promise<{
    id: string;
    salesProductId: string | null;
    createdByUserId: string | null;
  }> {
    const source = await tx.contentWorkspace.findFirst({
      where: {
        id: input.sourceWorkspaceId,
        organizationId: input.organizationId,
        ownerType: 'sales_product',
        status: 'active',
        isDeleted: false,
      },
      select: { id: true, salesProductId: true, createdByUserId: true },
    });
    if (!source) throw new NotFoundException('Source content workspace not found.');
    return source;
  }

  /**
   * A thumbnail that carries generation provenance must come from this
   * workspace's own ledger. A plain URL is one of the draft's images — Channels
   * owns that list — so AI adopts it into managed content instead of trying to
   * re-derive ownership it cannot see.
   */
  private async resolveThumbnailSelection(
    tx: Prisma.TransactionClient,
    input: RegistrationContentSelectionInput,
    source: { id: string; createdByUserId: string | null },
  ): Promise<void> {
    const hasThumbnailGeneration = Boolean(
      input.selectedThumbnailGenerationId
      || input.selectedThumbnailGenerationCandidateId,
    );
    if (hasThumbnailGeneration) {
      // Registration freezes this generation's candidate into the target, so the
      // row must not be archived between the check and the freeze.
      await lockActiveThumbnailGenerationSelection(tx, {
        organizationId: input.organizationId,
        sourceWorkspaceId: source.id,
        generationId: input.selectedThumbnailGenerationId,
        candidateId: input.selectedThumbnailGenerationCandidateId,
        url: input.selectedThumbnailUrl,
      });
      await this.validateThumbnailSelection(tx, input, source.id);
      return;
    }
    if (!input.selectedThumbnailUrl) return;

    const existing = await tx.contentAsset.findFirst({
      where: {
        organizationId: input.organizationId,
        url: input.selectedThumbnailUrl,
        isDeleted: false,
        thumbnailSelections: {
          some: {
            organizationId: input.organizationId,
            contentWorkspaceId: source.id,
          },
        },
      },
      select: { id: true },
    });
    if (existing) return;

    const asset = await this.ensureManagedThumbnailAsset(tx, {
      organizationId: input.organizationId,
      workspaceId: source.id,
      url: input.selectedThumbnailUrl,
      storageKey: null,
      mimeType: null,
      width: null,
      height: null,
      fileSize: null,
      createdByUserId: source.createdByUserId,
    });
    await lockActiveContentAsset(tx, input.organizationId, asset.id);
    await tx.contentWorkspaceThumbnailSelection.create({
      data: {
        organizationId: input.organizationId,
        contentWorkspaceId: source.id,
        contentAssetId: asset.id,
        sourceThumbnailGenerationId: null,
        sourceThumbnailCandidateId: null,
        createdByUserId: source.createdByUserId,
      },
      select: { id: true },
    });
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
    if (!hasThumbnailGeneration) return;

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
  }

  private async ensureManagedThumbnailAsset(
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

function activeSalesProductWorkspaceWhere(input: {
  organizationId: string;
  salesProductId: string;
}): Prisma.ContentWorkspaceWhereInput {
  return {
    organizationId: input.organizationId,
    ownerType: 'sales_product',
    salesProductId: input.salesProductId,
    status: 'active',
    isDeleted: false,
  };
}

function managedAssetKey(url: string): string {
  return `managed-url:${createHash('sha256').update(url).digest('hex')}`;
}

/**
 * Takes the generation and its candidate row under `FOR UPDATE` so a concurrent
 * archive cannot slip between validation and the registration freeze. An
 * incomplete provenance pair is rejected here rather than locked.
 */
async function lockActiveThumbnailGenerationSelection(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sourceWorkspaceId: string;
    generationId: string | null;
    candidateId: string | null;
    url: string | null;
  },
): Promise<void> {
  if (!input.url) {
    throw new BadRequestException(
      'Selected thumbnail URL is required with generation provenance.',
    );
  }
  if (!input.generationId || !input.candidateId) {
    throw new BadRequestException('Thumbnail generation provenance must be complete.');
  }
  const generations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM thumbnail_generations
    WHERE id = ${input.generationId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND content_workspace_id = ${input.sourceWorkspaceId}::uuid
      AND status = 'succeeded'
      AND is_deleted = false
    FOR UPDATE
  `);
  if (generations.length !== 1) {
    throw new BadRequestException(
      'Selected thumbnail generation is not successful source content.',
    );
  }

  const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM thumbnail_generation_candidates
    WHERE id = ${input.candidateId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND generation_id = ${input.generationId}::uuid
      AND url = ${input.url}
    FOR UPDATE
  `);
  if (candidates.length !== 1) {
    throw new BadRequestException(
      'Selected thumbnail generation is not successful source content.',
    );
  }
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
