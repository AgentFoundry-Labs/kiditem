import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type {
  AppendedRevision,
  AppendRevisionInput,
  CreateDetailPageInput,
  DetailPageRepositoryPort,
  DetailPageRevisionRow,
  DetailPageRow,
} from '../../../application/port/out/repository/detail-page.repository.port';
import { EDITOR_SAVE } from '../../../application/port/out/repository/detail-page.repository.port';
import {
  canTransitionDetailPage,
  decideRevisionPointer,
  decideWorkspacePointer,
  DETAIL_PAGE_SOURCES,
  DETAIL_PAGE_STATUSES,
  initialDetailPageStatus,
  type DetailPageStatus,
} from '../../../domain/detail-page/detail-page-lifecycle';
import {
  DETAIL_PAGE_REVISION_TYPE,
  DetailPageRevisionTypeSchema,
  type DetailPageRevisionType,
} from '../../../domain/detail-page/detail-page-revision-type';
import { rewriteDetailHtmlImageUrls, rewriteImageUrlList } from '../../../domain/detail-page/detail-html-image-urls';

type Client = Prisma.TransactionClient | PrismaService;

const PAGE_SELECT = {
  id: true,
  organizationId: true,
  contentWorkspaceId: true,
  source: true,
  templateId: true,
  title: true,
  status: true,
  generationInput: true,
  generationResult: true,
  errorMessage: true,
  currentRevisionId: true,
  triggeredByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DetailPageSelect;

const REVISION_SELECT = {
  id: true,
  detailPageId: true,
  revisionType: true,
  html: true,
  imageUrls: true,
  assetUrlMap: true,
  source: true,
  sourceDigest: true,
  createdByUserId: true,
  createdAt: true,
} satisfies Prisma.DetailPageRevisionSelect;

type PageRecord = Prisma.DetailPageGetPayload<{ select: typeof PAGE_SELECT }>;
type RevisionRecord = Prisma.DetailPageRevisionGetPayload<{ select: typeof REVISION_SELECT }>;

/**
 * `DetailPageRepositoryPort` 의 Prisma 구현(KID-313 W3b). 두 현재 포인터를 옮기는 쓰기는 모두 워크스페이스 행을
 * `FOR UPDATE` 로 잡은 뒤에 한다 — 같은 워크스페이스의 저장 · 가져오기 · 생성이 한 줄로 선다.
 */
@Injectable()
export class DetailPageRepositoryAdapter implements DetailPageRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(ownerTransaction(tx)));
  }

  async create(transaction: OwnerTransaction, input: CreateDetailPageInput): Promise<DetailPageRow> {
    if (input.status !== initialDetailPageStatus(input.source)) {
      throw new ConflictException(`A ${input.source} detail page starts ${initialDetailPageStatus(input.source)}.`);
    }
    const tx = ownerTransactionClient(transaction);
    const workspace = await tx.contentWorkspace.findFirst({
      where: { id: input.contentWorkspaceId, organizationId: input.organizationId, status: 'active', isDeleted: false },
      select: { id: true },
    });
    if (!workspace) throw new NotFoundException('Content workspace not found.');
    const row = await tx.detailPage.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        organizationId: input.organizationId,
        contentWorkspaceId: input.contentWorkspaceId,
        source: input.source,
        templateId: input.templateId,
        title: input.title,
        status: input.status,
        generationInput: input.generationInput as Prisma.InputJsonValue,
        triggeredByUserId: input.triggeredByUserId,
      },
      select: PAGE_SELECT,
    });
    return toPageRow(row);
  }

  async appendRevision(transaction: OwnerTransaction, input: AppendRevisionInput): Promise<AppendedRevision> {
    const tx = ownerTransactionClient(transaction);
    const locked = await lockWorkspaceOfPage(tx, input.organizationId, input.detailPageId);
    const page = await tx.detailPage.findFirstOrThrow({
      where: { id: input.detailPageId, organizationId: input.organizationId },
      select: { source: true, currentRevision: { select: { revisionType: true } } },
    });
    // 편집기 저장의 종류는 잠금 안에서 정한다 — 현재가 없는 생성 페이지의 첫 저장만 웹이 그린 `generated` 다.
    const revisionType: DetailPageRevisionType = input.revisionType !== EDITOR_SAVE
      ? input.revisionType
      : page.source === 'generated' && !page.currentRevision
        ? DETAIL_PAGE_REVISION_TYPE.generated
        : DETAIL_PAGE_REVISION_TYPE.manual_edit;
    const workspaceCurrentType = await revisionTypeOf(tx, input.organizationId, locked.currentRevisionId);
    const pagePointer = decideRevisionPointer({
      currentRevisionType: page.currentRevision ? parseRevisionType(page.currentRevision.revisionType) : null,
      incomingRevisionType: revisionType,
    });
    const workspacePointer = decideWorkspacePointer({
      pageAdvanced: pagePointer.advancePointer,
      workspaceCurrentRevisionType: workspaceCurrentType,
      incomingRevisionType: revisionType,
    });

    const revision = await tx.detailPageRevision.create({
      data: {
        organizationId: input.organizationId,
        detailPageId: input.detailPageId,
        revisionType,
        html: input.html,
        imageUrls: [...input.imageUrls],
        assetUrlMap: (input.assetUrlMap ?? {}) as Prisma.InputJsonValue,
        source: input.source ?? null,
        sourceDigest: input.sourceDigest ?? null,
        createdByUserId: input.createdByUserId,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
      select: REVISION_SELECT,
    });
    if (pagePointer.advancePointer) {
      await tx.detailPage.updateMany({
        where: { id: input.detailPageId, organizationId: input.organizationId },
        data: { currentRevisionId: revision.id },
      });
    } else {
      await touchPage(tx, input.organizationId, input.detailPageId);
    }
    if (workspacePointer.advancePointer) {
      await tx.contentWorkspace.updateMany({
        where: { id: locked.workspaceId, organizationId: input.organizationId },
        data: { currentDetailPageRevisionId: revision.id },
      });
    }
    return {
      ...toRevisionRow(revision),
      contentWorkspaceId: locked.workspaceId,
      becamePageCurrent: pagePointer.advancePointer,
      becameWorkspaceCurrent: workspacePointer.advancePointer,
    };
  }

  async setStatus(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string; status: DetailPageStatus; errorMessage?: string | null },
  ): Promise<void> {
    if (input.status === 'ready') {
      throw new ConflictException('A detail page becomes ready only by recording its generation result.');
    }
    const tx = ownerTransactionClient(transaction);
    const current = await lockPage(tx, input.organizationId, input.detailPageId);
    if (!canTransitionDetailPage(current.status, input.status)) {
      throw new ConflictException(`Detail page cannot move from ${current.status} to ${input.status}.`);
    }
    await tx.detailPage.updateMany({
      where: { id: input.detailPageId, organizationId: input.organizationId },
      data: {
        status: input.status,
        errorMessage: input.status === 'failed' ? input.errorMessage ?? null : null,
      },
    });
  }

  async completeGeneration(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string; title: string; generationResult: Record<string, unknown> },
  ): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    const current = await lockPage(tx, input.organizationId, input.detailPageId);
    if (current.source !== 'generated' || !canTransitionDetailPage(current.status, 'ready')) {
      throw new ConflictException(`Detail page cannot complete from ${current.status}.`);
    }
    await tx.detailPage.updateMany({
      where: { id: input.detailPageId, organizationId: input.organizationId },
      data: {
        status: 'ready',
        title: input.title,
        errorMessage: null,
        generationResult: input.generationResult as Prisma.InputJsonValue,
      },
    });
  }

  async clearWorkspacePointers(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceIds: readonly string[] },
  ): Promise<void> {
    if (input.contentWorkspaceIds.length === 0) return;
    await ownerTransactionClient(transaction).contentWorkspace.updateMany({
      where: { organizationId: input.organizationId, id: { in: [...input.contentWorkspaceIds] } },
      data: { currentDetailPageRevisionId: null },
    });
  }

  async setCurrentRevision(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceId: string; revisionId: string },
  ): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    await lockWorkspace(tx, input.organizationId, input.contentWorkspaceId);
    const revision = await tx.detailPageRevision.findFirst({
      where: {
        id: input.revisionId,
        organizationId: input.organizationId,
        detailPage: { organizationId: input.organizationId, contentWorkspaceId: input.contentWorkspaceId, isDeleted: false },
      },
      select: { id: true, detailPageId: true },
    });
    if (!revision) throw new BadRequestException('Selected detail revision is not source-owned.');
    await tx.detailPage.updateMany({
      where: { id: revision.detailPageId, organizationId: input.organizationId },
      data: { currentRevisionId: revision.id },
    });
    await tx.contentWorkspace.updateMany({
      where: { id: input.contentWorkspaceId, organizationId: input.organizationId },
      data: { currentDetailPageRevisionId: revision.id },
    });
  }

  async rename(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string; title: string },
  ): Promise<boolean> {
    const tx = ownerTransactionClient(transaction);
    const updated = await tx.detailPage.updateMany({
      where: { id: input.detailPageId, organizationId: input.organizationId, isDeleted: false },
      data: { title: input.title },
    });
    return updated.count === 1;
  }

  async markDeleted(
    transaction: OwnerTransaction,
    input: { organizationId: string; detailPageId: string },
  ): Promise<boolean> {
    const tx = ownerTransactionClient(transaction);
    const locked = await lockWorkspaceOfPage(tx, input.organizationId, input.detailPageId).catch((error: unknown) => {
      if (error instanceof NotFoundException) return null;
      throw error;
    });
    if (!locked) return false;
    await tx.detailPage.updateMany({
      where: { id: input.detailPageId, organizationId: input.organizationId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    const pointedRevision = locked.currentRevisionId
      ? await tx.detailPageRevision.findFirst({
        where: { id: locked.currentRevisionId, organizationId: input.organizationId },
        select: { detailPageId: true },
      })
      : null;
    if (pointedRevision?.detailPageId === input.detailPageId) {
      const fallback = await tx.detailPage.findFirst({
        where: {
          organizationId: input.organizationId,
          contentWorkspaceId: locked.workspaceId,
          isDeleted: false,
          currentRevisionId: { not: null },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { currentRevisionId: true },
      });
      await tx.contentWorkspace.updateMany({
        where: { id: locked.workspaceId, organizationId: input.organizationId },
        data: { currentDetailPageRevisionId: fallback?.currentRevisionId ?? null },
      });
    }
    return true;
  }

  async findById(input: { organizationId: string; detailPageId: string }): Promise<DetailPageRow | null> {
    const row = await this.prisma.detailPage.findFirst({
      where: { id: input.detailPageId, organizationId: input.organizationId, isDeleted: false },
      select: PAGE_SELECT,
    });
    return row ? toPageRow(row) : null;
  }

  async listByWorkspace(input: { organizationId: string; contentWorkspaceId: string | null }): Promise<DetailPageRow[]> {
    const rows = await this.prisma.detailPage.findMany({
      where: {
        organizationId: input.organizationId,
        isDeleted: false,
        ...(input.contentWorkspaceId ? { contentWorkspaceId: input.contentWorkspaceId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: PAGE_SELECT,
    });
    return rows.map(toPageRow);
  }

  async listRevisions(input: { organizationId: string; detailPageId: string }): Promise<DetailPageRevisionRow[]> {
    const rows = await this.prisma.detailPageRevision.findMany({
      where: {
        organizationId: input.organizationId,
        detailPageId: input.detailPageId,
        detailPage: { organizationId: input.organizationId, isDeleted: false },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: REVISION_SELECT,
    });
    return rows.map(toRevisionRow);
  }

  async findRevision(input: {
    organizationId: string;
    revisionId: string;
  }): Promise<(DetailPageRevisionRow & { contentWorkspaceId: string }) | null> {
    const row = await this.prisma.detailPageRevision.findFirst({
      where: {
        id: input.revisionId,
        organizationId: input.organizationId,
        detailPage: { organizationId: input.organizationId, isDeleted: false },
      },
      select: { ...REVISION_SELECT, detailPage: { select: { contentWorkspaceId: true } } },
    });
    if (!row) return null;
    return { ...toRevisionRow(row), contentWorkspaceId: row.detailPage.contentWorkspaceId };
  }

  async findWorkspaceRevision(input: {
    organizationId: string;
    contentWorkspaceId: string;
    revisionId: string | null;
  }): Promise<DetailPageRevisionRow | null> {
    const workspace = await this.prisma.contentWorkspace.findFirst({
      where: { id: input.contentWorkspaceId, organizationId: input.organizationId, status: 'active', isDeleted: false },
      select: { currentDetailPageRevisionId: true },
    });
    const revisionId = input.revisionId ?? workspace?.currentDetailPageRevisionId ?? null;
    if (!workspace || !revisionId) return null;
    const row = await this.prisma.detailPageRevision.findFirst({
      where: {
        id: revisionId,
        organizationId: input.organizationId,
        detailPage: { organizationId: input.organizationId, contentWorkspaceId: input.contentWorkspaceId, isDeleted: false },
      },
      select: REVISION_SELECT,
    });
    return row ? toRevisionRow(row) : null;
  }

  async rewriteImportedImageUrls(
    transaction: OwnerTransaction,
    input: { organizationId: string; contentWorkspaceId: string; replacements: ReadonlyMap<string, string> },
  ): Promise<{ revisionsUpdated: number }> {
    if (input.replacements.size === 0) return { revisionsUpdated: 0 };
    const tx = ownerTransactionClient(transaction);
    await lockWorkspace(tx, input.organizationId, input.contentWorkspaceId);
    const revisions = await tx.detailPageRevision.findMany({
      where: {
        organizationId: input.organizationId,
        source: { not: null },
        revisionType: DETAIL_PAGE_REVISION_TYPE.imported,
        detailPage: { organizationId: input.organizationId, contentWorkspaceId: input.contentWorkspaceId, isDeleted: false },
      },
      select: { id: true, html: true, imageUrls: true },
    });
    let revisionsUpdated = 0;
    for (const revision of revisions) {
      const rewritten = rewriteDetailHtmlImageUrls(revision.html, input.replacements);
      const imageUrls = stringArray(revision.imageUrls);
      const nextImageUrls = rewriteImageUrlList(imageUrls, input.replacements);
      const urlsChanged = nextImageUrls.some((url, index) => url !== imageUrls[index]);
      if (!rewritten.changed && !urlsChanged) continue;
      // 원문 digest(source_digest)는 그대로 둔다 — 다음 가져오기는 원문끼리 비교한다.
      await tx.detailPageRevision.updateMany({
        where: { id: revision.id, organizationId: input.organizationId },
        data: { html: rewritten.html, imageUrls: nextImageUrls },
      });
      revisionsUpdated += 1;
    }
    return { revisionsUpdated };
  }
}

async function lockWorkspace(
  tx: Prisma.TransactionClient,
  organizationId: string,
  workspaceId: string,
): Promise<{ workspaceId: string; currentRevisionId: string | null }> {
  const rows = await tx.$queryRaw<Array<{ id: string; currentRevisionId: string | null }>>(Prisma.sql`
    SELECT id, current_detail_page_revision_id AS "currentRevisionId"
    FROM content_workspaces
    WHERE id = ${workspaceId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND is_deleted = false
    FOR UPDATE
  `);
  const row = rows[0];
  if (!row) throw new NotFoundException('Content workspace not found.');
  return { workspaceId: row.id, currentRevisionId: row.currentRevisionId };
}

/** 페이지가 속한 워크스페이스를 잠근다. 지운 페이지 · 다른 조직의 페이지는 NotFound. */
async function lockWorkspaceOfPage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  detailPageId: string,
): Promise<{ workspaceId: string; currentRevisionId: string | null }> {
  const page = await tx.detailPage.findFirst({
    where: { id: detailPageId, organizationId, isDeleted: false },
    select: { contentWorkspaceId: true },
  });
  if (!page) throw new NotFoundException('Detail page not found.');
  return lockWorkspace(tx, organizationId, page.contentWorkspaceId);
}

async function lockPage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  detailPageId: string,
): Promise<{ status: DetailPageStatus; source: string }> {
  const rows = await tx.$queryRaw<Array<{ status: string; source: string }>>(Prisma.sql`
    SELECT status, source
    FROM detail_pages
    WHERE id = ${detailPageId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND is_deleted = false
    FOR UPDATE
  `);
  const row = rows[0];
  if (!row) throw new NotFoundException('Detail page not found.');
  return { status: parseStatus(row.status), source: row.source };
}

async function revisionTypeOf(
  tx: Client,
  organizationId: string,
  revisionId: string | null,
): Promise<DetailPageRevisionType | null> {
  if (!revisionId) return null;
  const row = await tx.detailPageRevision.findFirst({
    where: { id: revisionId, organizationId },
    select: { revisionType: true },
  });
  return row ? parseRevisionType(row.revisionType) : null;
}

async function touchPage(tx: Prisma.TransactionClient, organizationId: string, detailPageId: string): Promise<void> {
  await tx.detailPage.updateMany({
    where: { id: detailPageId, organizationId },
    data: { updatedAt: new Date() },
  });
}

function parseRevisionType(value: string): DetailPageRevisionType {
  return DetailPageRevisionTypeSchema.parse(value);
}

function parseStatus(value: string): DetailPageStatus {
  if ((DETAIL_PAGE_STATUSES as readonly string[]).includes(value)) return value as DetailPageStatus;
  throw new Error(`Unknown detail page status ${value}.`);
}

function toPageRow(row: PageRecord): DetailPageRow {
  if (!(DETAIL_PAGE_SOURCES as readonly string[]).includes(row.source)) {
    throw new Error(`Unknown detail page source ${row.source}.`);
  }
  return {
    ...row,
    source: row.source as DetailPageRow['source'],
    status: parseStatus(row.status),
    generationInput: asRecord(row.generationInput),
    generationResult: asRecord(row.generationResult),
  };
}

function toRevisionRow(row: RevisionRecord): DetailPageRevisionRow {
  return {
    ...row,
    revisionType: parseRevisionType(row.revisionType),
    imageUrls: stringArray(row.imageUrls),
    assetUrlMap: stringRecord(row.assetUrlMap),
  };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringRecord(value: Prisma.JsonValue): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(asRecord(value))) {
    if (typeof item === 'string') out[key] = item;
  }
  return out;
}
