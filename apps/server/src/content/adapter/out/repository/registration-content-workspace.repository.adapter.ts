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
  CreateManualDetailPageInput,
  CreateManualDetailPageResult,
  ImportDetailPageInput,
  ImportDetailPageResult,
  RegistrableDetailPage,
  RegistrationContentSelectionInput,
  ResolvedRegistrationContentSelections,
} from '../../../application/port/in/workspace/registration-content-workspace.port';
import { decideDetailPageImport } from '../../../domain/detail-page/detail-page-import-rule';
import {
  DETAIL_PAGE_REVISION_TYPE,
  DetailPageRevisionTypeSchema,
} from '../../../domain/detail-page/detail-page-revision-type';
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
    let thumbnailAssetId = input.selectedThumbnailAssetId;
    if (thumbnailAssetId) await assertOwnedThumbnailAsset(tx, input.organizationId, source.id, thumbnailAssetId);
    thumbnailAssetId ??= source.currentThumbnailAssetId;
    // 동결이 이 자산을 쓰는 동안 지워지지 않게 잠근다.
    if (thumbnailAssetId) await lockActiveContentAsset(tx, input.organizationId, thumbnailAssetId);

    let revisionId = input.selectedDetailPageRevisionId;
    if (revisionId) await findOwnedRevision(tx, input.organizationId, source.id, revisionId);
    revisionId ??= (await readCurrentRevision(tx, input.organizationId, source.id))?.id ?? null;
    return { selectedThumbnailAssetId: thumbnailAssetId, selectedDetailPageRevisionId: revisionId };
  }

  async validateSourceSelections(
    transaction: OwnerTransaction | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void> {
    const tx = transaction ? ownerTransactionClient(transaction) : this.prisma;
    const source = await this.findSourceWorkspace(tx, input);
    if (input.selectedThumbnailAssetId) {
      await assertOwnedThumbnailAsset(tx, input.organizationId, source.id, input.selectedThumbnailAssetId);
    }
    if (input.selectedDetailPageRevisionId) {
      await findOwnedRevision(tx, input.organizationId, source.id, input.selectedDetailPageRevisionId);
    }
  }

  async readRegistrableDetailPage(input: {
    organizationId: string;
    salesProductId: string;
    revisionId: string | null;
  }): Promise<RegistrableDetailPage | null> {
    const workspace = await this.prisma.contentWorkspace.findFirst({
      where: activeSalesProductWorkspaceWhere(input),
      select: { id: true },
    });
    if (!workspace) {
      if (input.revisionId) throw new BadRequestException('Selected detail revision is not source-owned.');
      return null;
    }
    const revision = input.revisionId
      ? await findOwnedRevision(this.prisma, input.organizationId, workspace.id, input.revisionId)
      : await readCurrentRevision(this.prisma, input.organizationId, workspace.id);
    return revision ? toRegistrableDetailPage(workspace.id, revision) : null;
  }

  /**
   * 여러 상품의 상세를 쿼리 몇 개로 읽는다(워크스페이스와 현재 revision, 고른 revision) — 상품 수만큼 읽지
   * 않는다. 고른 revision 이 그 상품 워크스페이스의 것이 아니면 한 건 읽기와 같이 거절한다.
   */
  async readRegistrableDetailPages(input: {
    organizationId: string;
    requests: ReadonlyArray<{ salesProductId: string; revisionId: string | null }>;
  }): Promise<ReadonlyMap<string, RegistrableDetailPage>> {
    if (input.requests.length === 0) return new Map();
    const { organizationId } = input;
    const workspaces = await this.prisma.contentWorkspace.findMany({
      where: {
        organizationId,
        ownerType: 'sales_product',
        salesProductId: { in: [...new Set(input.requests.map((request) => request.salesProductId))] },
        status: 'active',
        isDeleted: false,
      },
      select: { id: true, salesProductId: true, ...currentRevisionSelect(organizationId) },
    });
    const workspaceByProduct = new Map(workspaces.map((workspace) => [workspace.salesProductId, workspace]));
    const chosenIds = [...new Set(input.requests.flatMap((request) => request.revisionId ? [request.revisionId] : []))];
    const chosen = chosenIds.length === 0 ? [] : await this.prisma.detailPageRevision.findMany({
      where: { id: { in: chosenIds }, organizationId, artifact: { organizationId, isDeleted: false } },
      select: { ...REVISION_SELECT, artifact: { select: { contentWorkspaceId: true } } },
    });
    const chosenById = new Map(chosen.map((revision) => [revision.id, revision]));

    const pages = new Map<string, RegistrableDetailPage>();
    for (const request of input.requests) {
      const workspace = workspaceByProduct.get(request.salesProductId);
      if (request.revisionId) {
        const revision = chosenById.get(request.revisionId);
        if (!workspace || !revision || revision.artifact.contentWorkspaceId !== workspace.id) {
          throw new BadRequestException('Selected detail revision is not source-owned.');
        }
        pages.set(request.salesProductId, toRegistrableDetailPage(workspace.id, revision));
        continue;
      }
      const revision = workspace ? pickCurrentRevision(workspace) : null;
      if (workspace && revision) pages.set(request.salesProductId, toRegistrableDetailPage(workspace.id, revision));
    }
    return pages;
  }

  /**
   * 가져온 상세를 `imported` revision 으로 쌓는다. 원천마다 가져오기 전용 상세페이지 버전(생성 · 아티팩트)
   * 하나를 두고 거기에 revision 을 잇는다 — 올린 상세페이지와 같은 자리라 편집기 · 몰 등록 · 대량등록
   * 엑셀이 그대로 읽는다. 무엇을 가져왔는지는 revision 행의 `source` · `source_digest` 가 말한다: 마지막으로
   * 가져온 digest 는 이 워크스페이스에서 같은 원천의 가장 새 revision 의 것이다. 현재 포인터는
   * `decideDetailPageImport` 가 정한다.
   */
  async importDetailPage(
    transaction: OwnerTransaction,
    input: ImportDetailPageInput & { imageUrls: readonly string[] },
  ): Promise<ImportDetailPageResult> {
    const tx = ownerTransactionClient(transaction);
    const locked = await tx.$queryRaw<Array<{ id: string; displayName: string }>>(Prisma.sql`
      SELECT id, display_name AS "displayName"
      FROM content_workspaces
      WHERE organization_id = ${input.organizationId}::uuid
        AND sales_product_id = ${input.salesProductId}::uuid
        AND owner_type = 'sales_product'
        AND status = 'active'
        AND is_deleted = false
      FOR UPDATE
    `);
    const workspace = locked[0];
    if (!workspace) throw new NotFoundException('Sales product content workspace not found.');

    const artifactSource = importArtifactSource(input.source);
    const current = await readCurrentRevision(tx, input.organizationId, workspace.id);
    const lastImported = await tx.detailPageRevision.findFirst({
      where: {
        organizationId: input.organizationId,
        source: input.source,
        artifact: { organizationId: input.organizationId, contentWorkspaceId: workspace.id },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { sourceDigest: true },
    });
    const decision = decideDetailPageImport({
      currentRevisionType: current ? DetailPageRevisionTypeSchema.parse(current.revisionType) : null,
      lastImportedDigest: lastImported?.sourceDigest ?? null,
      incomingDigest: input.digest,
    });
    if (decision.kind === 'skip') {
      return { kind: 'skipped', reason: 'unchanged', workspaceId: workspace.id, currentRevisionId: current?.id ?? null };
    }

    const existing = await tx.detailPageArtifact.findFirst({
      where: {
        organizationId: input.organizationId,
        contentWorkspaceId: workspace.id,
        isDeleted: false,
        metadata: { path: ['source'], equals: artifactSource },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sourceContentGenerationId: true },
    });
    const artifact = existing ?? await createDetailPageContainer(tx, {
      organizationId: input.organizationId,
      workspaceId: workspace.id,
      source: artifactSource,
      title: workspace.displayName,
      createdByUserId: input.createdByUserId,
    });
    const revision = await tx.detailPageRevision.create({
      data: {
        organizationId: input.organizationId,
        artifactId: artifact.id,
        contentGenerationId: artifact.sourceContentGenerationId,
        revisionType: DETAIL_PAGE_REVISION_TYPE.imported,
        html: input.html,
        imageUrls: [...input.imageUrls],
        source: input.source,
        sourceDigest: input.digest,
        createdByUserId: input.createdByUserId,
      },
      select: { id: true },
    });
    // 새로 만든 가져오기 버전은 이 revision 말고는 가진 것이 없어 그 버전의 현재가 된다. 워크스페이스
    // 포인터는 규칙이 허락할 때만 옮긴다.
    if (decision.advancePointer || !existing) {
      await tx.detailPageArtifact.updateMany({
        where: { id: artifact.id, organizationId: input.organizationId },
        data: { currentRevisionId: revision.id },
      });
    }
    if (decision.advancePointer) {
      await tx.contentWorkspace.updateMany({
        where: { id: workspace.id, organizationId: input.organizationId },
        data: { currentDetailPageArtifactId: artifact.id, currentDetailPageRevisionId: revision.id },
      });
    }
    return {
      kind: 'appended',
      workspaceId: workspace.id,
      revisionId: revision.id,
      becameCurrent: decision.advancePointer,
    };
  }

  async createManualDetailPage(
    input: CreateManualDetailPageInput & { imageUrls: readonly string[] },
  ): Promise<CreateManualDetailPageResult> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; displayName: string; hasDetail: boolean }>>(Prisma.sql`
        SELECT id, display_name AS "displayName",
          (current_detail_page_artifact_id IS NOT NULL OR current_detail_page_revision_id IS NOT NULL) AS "hasDetail"
        FROM content_workspaces
        WHERE organization_id = ${input.organizationId}::uuid
          AND sales_product_id = ${input.salesProductId}::uuid
          AND owner_type = 'sales_product'
          AND status = 'active'
          AND is_deleted = false
        FOR UPDATE
      `);
      const workspace = locked[0];
      if (!workspace) throw new NotFoundException('Sales product content workspace not found.');
      if (workspace.hasDetail) {
        throw new ConflictException('이미 상세 페이지가 있습니다. 그 상세를 고쳐 저장하세요.');
      }
      const artifact = await createDetailPageContainer(tx, {
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        source: 'manual',
        title: workspace.displayName,
        createdByUserId: input.createdByUserId,
      });
      const revision = await tx.detailPageRevision.create({
        data: {
          organizationId: input.organizationId,
          artifactId: artifact.id,
          contentGenerationId: artifact.sourceContentGenerationId,
          revisionType: DETAIL_PAGE_REVISION_TYPE.manual_edit,
          html: input.html,
          imageUrls: [...input.imageUrls],
          createdByUserId: input.createdByUserId,
        },
        select: { id: true },
      });
      await tx.detailPageArtifact.updateMany({
        where: { id: artifact.id, organizationId: input.organizationId },
        data: { currentRevisionId: revision.id },
      });
      await tx.contentWorkspace.updateMany({
        where: { id: workspace.id, organizationId: input.organizationId },
        data: { currentDetailPageArtifactId: artifact.id, currentDetailPageRevisionId: revision.id },
      });
      return { workspaceId: workspace.id, revisionId: revision.id, contentGenerationId: artifact.sourceContentGenerationId! };
    });
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

  /**
   * 판매 상품마다 활성 워크스페이스는 하나다(KID-313 W2). 상품을 만드는 모든 길이 같은 트랜잭션에서
   * 부르므로 동시에 불러도 부분 유일키 위에서 한 줄로 모인다 — 충돌은 오류가 아니라 이미 있다는 뜻이다.
   */
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
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO content_workspaces (
        id, organization_id, owner_type, sales_product_id, display_name, normalized_title,
        status, created_by_user_id
      )
      VALUES (
        gen_random_uuid(), ${input.organizationId}::uuid, 'sales_product', ${input.salesProductId}::uuid,
        ${input.displayName}, ${input.normalizedTitle}, 'active', ${input.createdByUserId}::uuid
      )
      ON CONFLICT (organization_id, sales_product_id)
        WHERE sales_product_id IS NOT NULL AND status = 'active' AND is_deleted = false
      DO NOTHING
    `);
    const workspace = await tx.contentWorkspace.findFirstOrThrow({
      where: activeSalesProductWorkspaceWhere(input),
      select: { id: true },
    });
    return { workspaceId: workspace.id };
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

    let claimed: { count: number };
    try {
      claimed = await tx.contentWorkspace.updateMany({
        where: {
          id: workspace.id,
          organizationId: input.organizationId,
          channelListingId: null,
          status: 'active',
          isDeleted: false,
        },
        data: { channelListingId: input.listingId },
      });
    } catch (error) {
      // `content_workspaces_listing_active_key`: another active workspace already
      // speaks for this listing. That is a domain conflict, not a driver fault.
      if (!isUniqueConstraintError(error)) throw error;
      throw new ConflictException(
        'Another active content workspace already belongs to this listing.',
      );
    }
    if (claimed.count !== 1) {
      throw new ConflictException(
        'Content workspace changed while the listing was being attached.',
      );
    }
    return { workspaceId: workspace.id };
  }

  private async findSourceWorkspace(
    tx: Pick<Prisma.TransactionClient, 'contentWorkspace'>,
    input: Pick<RegistrationContentSelectionInput, 'organizationId' | 'sourceWorkspaceId'>,
  ): Promise<{ id: string; currentThumbnailAssetId: string | null }> {
    const source = await tx.contentWorkspace.findFirst({
      where: {
        id: input.sourceWorkspaceId,
        organizationId: input.organizationId,
        ownerType: 'sales_product',
        status: 'active',
        isDeleted: false,
      },
      select: { id: true, currentThumbnailSelection: { select: { contentAssetId: true } } },
    });
    if (!source) throw new NotFoundException('Source content workspace not found.');
    return { id: source.id, currentThumbnailAssetId: source.currentThumbnailSelection?.contentAssetId ?? null };
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

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2002';
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

type Reader = Pick<Prisma.TransactionClient, 'contentAsset' | 'contentWorkspace' | 'detailPageRevision'>;

const REVISION_SELECT = {
  id: true,
  artifactId: true,
  revisionType: true,
  html: true,
  imageUrls: true,
} satisfies Prisma.DetailPageRevisionSelect;

type RevisionRow = Prisma.DetailPageRevisionGetPayload<{ select: typeof REVISION_SELECT }>;

/** 대표이미지 자산은 이 워크스페이스가 만든(자산 묶음) 것이거나 이 워크스페이스가 골랐던 것이어야 한다. */
async function assertOwnedThumbnailAsset(
  tx: Reader,
  organizationId: string,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  const asset = await tx.contentAsset.findFirst({
    where: {
      id: assetId,
      organizationId,
      isDeleted: false,
      OR: [
        { originGenerationGroup: { contentWorkspaceId: workspaceId } },
        { thumbnailSelections: { some: { organizationId, contentWorkspaceId: workspaceId } } },
      ],
    },
    select: { id: true },
  });
  if (!asset) throw new BadRequestException('Selected thumbnail asset is not source-owned.');
}

async function findOwnedRevision(
  tx: Reader,
  organizationId: string,
  workspaceId: string,
  revisionId: string,
): Promise<RevisionRow> {
  const revision = await tx.detailPageRevision.findFirst({
    where: {
      id: revisionId,
      organizationId,
      artifact: { organizationId, contentWorkspaceId: workspaceId, isDeleted: false },
    },
    select: REVISION_SELECT,
  });
  if (!revision) throw new BadRequestException('Selected detail revision is not source-owned.');
  return revision;
}

/**
 * 워크스페이스의 현재 상세. 리비전 포인터, 현재 아티팩트의 현재 리비전, 가장 최근 아티팩트의 현재
 * 리비전 순이다(`findWorkspaceCurrentDetailPageHtml` 과 같은 계약). 그 밖의 무엇으로도 대체하지 않는다.
 */
async function readCurrentRevision(
  tx: Reader,
  organizationId: string,
  workspaceId: string,
): Promise<RevisionRow | null> {
  const workspace = await tx.contentWorkspace.findFirst({
    where: { id: workspaceId, organizationId, isDeleted: false },
    select: currentRevisionSelect(organizationId),
  });
  return workspace ? pickCurrentRevision(workspace) : null;
}

function currentRevisionSelect(organizationId: string) {
  return {
    currentDetailPageRevision: { select: REVISION_SELECT },
    currentDetailPageArtifact: { select: { isDeleted: true, currentRevision: { select: REVISION_SELECT } } },
    detailPageArtifacts: {
      where: { organizationId, isDeleted: false, currentRevisionId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: { currentRevision: { select: REVISION_SELECT } },
    },
  } satisfies Prisma.ContentWorkspaceSelect;
}

function pickCurrentRevision(workspace: {
  currentDetailPageRevision: RevisionRow | null;
  currentDetailPageArtifact: { isDeleted: boolean; currentRevision: RevisionRow | null } | null;
  detailPageArtifacts: Array<{ currentRevision: RevisionRow | null }>;
}): RevisionRow | null {
  return workspace.currentDetailPageRevision
    ?? (workspace.currentDetailPageArtifact?.isDeleted ? null : workspace.currentDetailPageArtifact?.currentRevision)
    ?? workspace.detailPageArtifacts[0]?.currentRevision
    ?? null;
}

function toRegistrableDetailPage(workspaceId: string, revision: RevisionRow): RegistrableDetailPage {
  return {
    workspaceId,
    revisionId: revision.id,
    revisionType: DetailPageRevisionTypeSchema.parse(revision.revisionType),
    html: revision.html,
    imageUrls: stringArray(revision.imageUrls),
  };
}

/** 가져오기 전용 아티팩트의 표지(`metadata.source`). 무엇을 가져왔는지는 revision 행이 말한다. */
function importArtifactSource(source: ImportDetailPageInput['source']): string {
  return `${source}_import`;
}

function stringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * 상세 그릇 하나(생성 묶음 · 생성 · 아티팩트) — 가져오기와 허브의 첫 상세가 같은 모양을 쓴다. `source` 가 어디서
 * 왔는지 말한다. 돌릴 생성 작업이 없으니 `COMPLETED` 로 연다.
 */
async function createDetailPageContainer(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; workspaceId: string; source: string; title: string; createdByUserId: string | null },
): Promise<{ id: string; sourceContentGenerationId: string | null }> {
  const title = input.title.trim().slice(0, 80) || '상세페이지';
  const group = await tx.contentGenerationGroup.create({
    data: {
      organizationId: input.organizationId,
      contentWorkspaceId: input.workspaceId,
      groupType: 'input_variation',
      title,
      createdByUserId: input.createdByUserId,
      metadata: { source: input.source },
    },
    select: { id: true },
  });
  const generation = await tx.contentGeneration.create({
    data: {
      organizationId: input.organizationId,
      contentType: 'detail_page',
      generationGroupId: group.id,
      contentWorkspaceId: input.workspaceId,
      triggeredByUserId: input.createdByUserId,
      templateId: null,
      generationInput: { source: input.source },
      generationResult: { source: input.source },
      generatedTitle: title,
      status: 'COMPLETED',
    },
    select: { id: true },
  });
  const artifact = await tx.detailPageArtifact.create({
    data: {
      organizationId: input.organizationId,
      contentWorkspaceId: input.workspaceId,
      sourceContentGenerationId: generation.id,
      title,
      status: 'draft',
      createdByUserId: input.createdByUserId,
      metadata: { source: input.source },
    },
    select: { id: true, sourceContentGenerationId: true },
  });
  await tx.contentGeneration.updateMany({
    where: { id: generation.id, organizationId: input.organizationId },
    data: { detailPageArtifactId: artifact.id },
  });
  return artifact;
}
