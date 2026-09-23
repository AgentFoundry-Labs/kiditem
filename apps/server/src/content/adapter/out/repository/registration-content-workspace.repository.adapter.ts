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
import {
  DETAIL_PAGE_REPOSITORY_PORT,
  type DetailPageRepositoryPort,
} from '../../../application/port/out/repository/detail-page.repository.port';
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
    @Inject(DETAIL_PAGE_REPOSITORY_PORT)
    private readonly detailPages: DetailPageRepositoryPort,
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
      select: { id: true, salesProductId: true, ...currentRevisionSelect() },
    });
    const workspaceByProduct = new Map(workspaces.map((workspace) => [workspace.salesProductId, workspace]));
    const chosenIds = [...new Set(input.requests.flatMap((request) => request.revisionId ? [request.revisionId] : []))];
    const chosen = chosenIds.length === 0 ? [] : await this.prisma.detailPageRevision.findMany({
      where: { id: { in: chosenIds }, organizationId, detailPage: { organizationId, isDeleted: false } },
      select: { ...REVISION_SELECT, detailPage: { select: { contentWorkspaceId: true } } },
    });
    const chosenById = new Map(chosen.map((revision) => [revision.id, revision]));

    const pages = new Map<string, RegistrableDetailPage>();
    for (const request of input.requests) {
      const workspace = workspaceByProduct.get(request.salesProductId);
      if (request.revisionId) {
        const revision = chosenById.get(request.revisionId);
        if (!workspace || !revision || revision.detailPage.contentWorkspaceId !== workspace.id) {
          throw new BadRequestException('Selected detail revision is not source-owned.');
        }
        pages.set(request.salesProductId, toRegistrableDetailPage(workspace.id, revision));
        continue;
      }
      const revision = workspace?.currentDetailPageRevision ?? null;
      if (workspace && revision) pages.set(request.salesProductId, toRegistrableDetailPage(workspace.id, revision));
    }
    return pages;
  }

  /**
   * 가져온 상세를 `imported` revision 으로 쌓는다. 원천마다 가져오기 상세 페이지(`source: 'imported'`) 하나를 두고
   * 거기에 revision 을 잇는다 — 편집기 · 몰 등록 · 대량등록 엑셀이 그대로 읽는다. 무엇을 가져왔는지는 revision 행의
   * `source` · `source_digest` 가 말한다: 마지막으로 가져온 digest 는 이 워크스페이스에서 같은 원천의 가장 새
   * revision 의 것이다. 두 현재 포인터는 상세 페이지 저장소가 `decideRevisionPointer` 로 옮긴다.
   */
  async importDetailPage(
    transaction: OwnerTransaction,
    input: ImportDetailPageInput & { imageUrls: readonly string[] },
  ): Promise<ImportDetailPageResult> {
    const tx = ownerTransactionClient(transaction);
    const workspace = await lockSalesProductWorkspace(tx, input);
    const lastImported = await tx.detailPageRevision.findFirst({
      where: {
        organizationId: input.organizationId,
        source: input.source,
        detailPage: { organizationId: input.organizationId, contentWorkspaceId: workspace.id, source: 'imported', isDeleted: false },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { sourceDigest: true, detailPageId: true },
    });
    if (lastImported && lastImported.sourceDigest === input.digest) {
      return { kind: 'skipped', reason: 'unchanged', workspaceId: workspace.id, currentRevisionId: workspace.currentRevisionId };
    }

    const detailPageId = lastImported?.detailPageId ?? (await this.detailPages.create(transaction, {
      organizationId: input.organizationId,
      contentWorkspaceId: workspace.id,
      source: 'imported',
      templateId: null,
      title: null,
      status: 'ready',
      generationInput: { importSource: input.source },
      triggeredByUserId: input.createdByUserId,
    })).id;
    const revision = await this.detailPages.appendRevision(transaction, {
      organizationId: input.organizationId,
      detailPageId,
      revisionType: DETAIL_PAGE_REVISION_TYPE.imported,
      html: input.html,
      imageUrls: input.imageUrls,
      source: input.source,
      sourceDigest: input.digest,
      createdByUserId: input.createdByUserId,
    });
    return {
      kind: 'appended',
      workspaceId: workspace.id,
      revisionId: revision.id,
      becameCurrent: revision.becameWorkspaceCurrent,
    };
  }

  async createManualDetailPage(
    input: CreateManualDetailPageInput & { imageUrls: readonly string[] },
  ): Promise<CreateManualDetailPageResult> {
    return this.detailPages.runInTransaction(async (transaction) => {
      const tx = ownerTransactionClient(transaction);
      const workspace = await lockSalesProductWorkspace(tx, input);
      const livePages = await tx.detailPage.count({
        where: { organizationId: input.organizationId, contentWorkspaceId: workspace.id, isDeleted: false },
      });
      if (workspace.currentRevisionId || livePages > 0) {
        throw new ConflictException('이미 상세 페이지가 있습니다. 그 상세를 고쳐 저장하세요.');
      }
      const page = await this.detailPages.create(transaction, {
        organizationId: input.organizationId,
        contentWorkspaceId: workspace.id,
        source: 'manual',
        templateId: null,
        title: null,
        status: 'ready',
        generationInput: {},
        triggeredByUserId: input.createdByUserId,
      });
      const revision = await this.detailPages.appendRevision(transaction, {
        organizationId: input.organizationId,
        detailPageId: page.id,
        revisionType: DETAIL_PAGE_REVISION_TYPE.manual_edit,
        html: input.html,
        imageUrls: input.imageUrls,
        createdByUserId: input.createdByUserId,
      });
      return { workspaceId: workspace.id, revisionId: revision.id, detailPageId: page.id };
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
      createdByUserId: string | null;
    },
  ): Promise<{ workspaceId: string }> {
    const tx = ownerTransactionClient(transaction);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO content_workspaces (
        id, organization_id, owner_type, sales_product_id, status, created_by_user_id
      )
      VALUES (
        gen_random_uuid(), ${input.organizationId}::uuid, 'sales_product', ${input.salesProductId}::uuid,
        'active', ${input.createdByUserId}::uuid
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
      select: { id: true, currentThumbnailAssetId: true },
    });
    if (!source) throw new NotFoundException('Source content workspace not found.');
    return source;
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
  detailPageId: true,
  revisionType: true,
  html: true,
  imageUrls: true,
} satisfies Prisma.DetailPageRevisionSelect;

type RevisionRow = Prisma.DetailPageRevisionGetPayload<{ select: typeof REVISION_SELECT }>;

/** 대표이미지 자산은 이 워크스페이스의 것이어야 한다(자산은 워크스페이스 하나에 속한다, KID-313 W3). */
async function assertOwnedThumbnailAsset(
  tx: Reader,
  organizationId: string,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  const asset = await tx.contentAsset.findFirst({
    where: { id: assetId, organizationId, contentWorkspaceId: workspaceId, isDeleted: false },
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
      detailPage: { organizationId, contentWorkspaceId: workspaceId, isDeleted: false },
    },
    select: REVISION_SELECT,
  });
  if (!revision) throw new BadRequestException('Selected detail revision is not source-owned.');
  return revision;
}

/** 워크스페이스의 현재 상세 — 포인터 하나(`current_detail_page_revision_id`). 그 밖의 무엇으로도 대체하지 않는다. */
async function readCurrentRevision(
  tx: Reader,
  organizationId: string,
  workspaceId: string,
): Promise<RevisionRow | null> {
  const workspace = await tx.contentWorkspace.findFirst({
    where: { id: workspaceId, organizationId, isDeleted: false },
    select: currentRevisionSelect(),
  });
  return workspace?.currentDetailPageRevision ?? null;
}

function currentRevisionSelect() {
  return {
    currentDetailPageRevision: { select: REVISION_SELECT },
  } satisfies Prisma.ContentWorkspaceSelect;
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

function stringArray(value: Prisma.JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** 판매 상품의 살아 있는 작업공간을 잠근다(가져오기 · 첫 상세가 같은 워크스페이스에서 한 줄로 선다). */
async function lockSalesProductWorkspace(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; salesProductId: string },
): Promise<{ id: string; currentRevisionId: string | null }> {
  const locked = await tx.$queryRaw<Array<{ id: string; currentRevisionId: string | null }>>(Prisma.sql`
    SELECT id, current_detail_page_revision_id AS "currentRevisionId"
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
  return workspace;
}
