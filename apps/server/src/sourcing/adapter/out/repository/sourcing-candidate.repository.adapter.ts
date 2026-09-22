import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../channels/application/port/in/listing/channel-listing-query.port';
import {
  CANDIDATE_REGISTRATION_PORT,
  type CandidateRegistrationPort,
  type ProductPreparationRow,
} from '../../../../channels/application/port/in/candidate-registration.port';
import { upsertSourcedCandidateIn, ensureSourcedCandidateImages } from './sourcing-candidate-upsert.transaction';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftPort,
  type SalesProductDraftSourceFacts,
} from '../../../application/port/out/cross-domain/sales-product-draft.port';
import type {
  CandidateImageRow,
  CandidateRow,
  SourcingCandidateRepositoryPort,
  SourcingCandidateStateRow,
  UpsertCandidateInput,
  UpsertCandidateWithIdempotencyReceiptInput,
} from '../../../application/port/out/repository/sourcing-candidate.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class SourcingCandidateRepositoryAdapter implements SourcingCandidateRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    // 초안 없는 수집은 없다(KID-310). 필수 주입이라 배선이 빠지면 부팅이 선다 —
    // 초안이 없으면 편집 · 등록 · 몰 엑셀이 모두 갈 곳을 잃는다.
    @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly salesProductDrafts: SalesProductDraftPort,
    @Optional() @Inject(CANDIDATE_REGISTRATION_PORT)
    private readonly candidateRegistrations?: CandidateRegistrationPort,
    @Optional() @Inject(CHANNEL_LISTING_QUERY_PORT)
    private readonly channelListings?: ChannelListingQueryPort,
  ) {}

  runInTransaction<T>(
    operation: (tx: SourcingRepositoryTransaction, ownerTx: OwnerTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx) => operation(tx as SourcingRepositoryTransaction, ownerTransaction(tx)),
      options,
    );
  }

  async findActiveBySourceUrl(input: {
    organizationId: string;
    sourceUrl: string;
  }): Promise<CandidateRow | null> {
    const row = await this.prisma.sourcingCandidate.findFirst({
      where: {
        organizationId: input.organizationId,
        sourceUrl: input.sourceUrl,
        isDeleted: false,
        status: 'sourced',
      },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toRow(row) : null;
  }

  async upsertSourced(input: UpsertCandidateInput): Promise<CandidateRow> {
    try {
      return await this.upsertSourcedInTransaction(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return this.upsertSourcedInTransaction(input);
    }
  }

  async upsertSourcedWithIdempotencyReceipt(
    input: UpsertCandidateWithIdempotencyReceiptInput,
  ): Promise<{ candidateId: string }> {
    const result = await this.upsertSourcedReceiptInTransaction(input);
    // 직접 작성 · Agent 경로도 후보 하나에 초안 하나다(KID-310). 멱등이라 영수증 재생에도 안전하다.
    await this.ensureDraft(input, result.candidateId);
    return result;
  }

  private async upsertSourcedReceiptInTransaction(
    input: UpsertCandidateWithIdempotencyReceiptInput,
  ): Promise<{ candidateId: string }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await advisoryLock(
            tx,
            input.organizationId,
            'sourcing-owner-receipt',
            input.capabilityKey,
            input.idempotencyKey,
          );
          const receipt = await tx.sourcingOwnerIdempotencyReceipt.findFirst({
            where: {
              organizationId: input.organizationId,
              capabilityKey: input.capabilityKey,
              idempotencyKey: input.idempotencyKey,
            },
            select: { requestHash: true, result: true },
          });
          if (receipt) {
            if (receipt.requestHash !== input.requestHash) {
              throw new Error('owner_idempotency_input_conflict');
            }
            return receiptCandidateResult(receipt.result);
          }

          await advisoryLock(tx, input.organizationId, 'sourcing-candidate', input.idempotencyKey);
          const candidate = await upsertSourcedCandidateIn(tx, input);
          const result = { candidateId: candidate.id };
          await tx.sourcingOwnerIdempotencyReceipt.create({
            data: {
              organizationId: input.organizationId,
              capabilityKey: input.capabilityKey,
              idempotencyKey: input.idempotencyKey,
              requestHash: input.requestHash,
              result,
            },
          });
          return result;
        });
      } catch (error) {
        if (!isUniqueConstraintError(error) || attempt === 1) throw error;
      }
    }
    throw new Error('sourcing_owner_idempotency_receipt_retry_exhausted');
  }

  async claimQuickProcessCandidate(input: {
    organizationId: string;
    candidateId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ candidateId: string }> {
    const capabilityKey = 'sourcing.quick_process';
    return this.prisma.$transaction(async (tx) => {
      await advisoryLock(
        tx,
        input.organizationId,
        'sourcing-owner-receipt',
        capabilityKey,
        input.idempotencyKey,
      );
      const receipt = await tx.sourcingOwnerIdempotencyReceipt.findFirst({
        where: {
          organizationId: input.organizationId,
          capabilityKey,
          idempotencyKey: input.idempotencyKey,
        },
        select: { requestHash: true, result: true },
      });
      if (receipt) {
        if (receipt.requestHash !== input.requestHash) {
          throw new Error('owner_idempotency_input_conflict');
        }
        return receiptCandidateResult(receipt.result);
      }

      const result = { candidateId: input.candidateId };
      await tx.sourcingOwnerIdempotencyReceipt.create({
        data: {
          organizationId: input.organizationId,
          capabilityKey,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          result,
        },
      });
      return result;
    });
  }

  async mergeDescription(input: {
    organizationId: string;
    sourceUrl: string;
    rawData: object;
    description: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    images: UpsertCandidateInput['images'];
  }): Promise<CandidateRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.sourcingCandidate.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceUrl: input.sourceUrl,
          isDeleted: false,
          status: 'sourced',
        },
      });
      if (!existing) return null;
      const updated = await tx.sourcingCandidate.update({
        where: { id: existing.id },
        data: {
          rawData: mergeJson(existing.rawData, input.rawData) as Prisma.InputJsonValue,
          description: input.description ?? existing.description,
          thumbnailUrl: existing.thumbnailUrl ?? input.thumbnailUrl,
          imageUrl: existing.imageUrl ?? input.imageUrl,
        },
      });
      await ensureSourcedCandidateImages(tx, updated.id, input.organizationId, input.images);
      return toRow(updated);
    });
  }

  async findById(id: string, organizationId: string) {
    const row = await this.prisma.sourcingCandidate.findFirst({
      where: { id, organizationId, isDeleted: false },
      include: {
        images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!row) return null;
    const registrations = await this.readCandidateRegistrations(organizationId, [row.id]);
    return {
      ...hydrateCandidate(row, registrations.get(row.id)),
      registrationState: registrations.get(row.id)?.registrationState ?? 'none',
    };
  }

  async listSourced(query: {
    organizationId: string;
    page: number;
    limit: number;
    sort: 'newest' | 'oldest' | 'name_asc';
    platform?: string;
    sourcePlatforms?: string[];
  }) {
    const where: Prisma.SourcingCandidateWhereInput = {
      organizationId: query.organizationId,
      isDeleted: false,
      status: 'sourced',
      ...(query.platform
        ? { sourcePlatform: query.platform }
        : query.sourcePlatforms?.length
          ? { sourcePlatform: { in: query.sourcePlatforms } }
          : {}),
    };
    const orderBy =
      query.sort === 'oldest' ? { createdAt: 'asc' as const }
        : query.sort === 'name_asc' ? { name: 'asc' as const }
          : { createdAt: 'desc' as const };
    const channelListings = this.channelListings;
    if (!channelListings) throw new Error('channel_listing_query_port_missing');
    const [total, rows] = await this.prisma.$transaction(async (tx) => {
      const registeredCandidateIds = await channelListings.readRegisteredCandidateIds(
        ownerTransaction(tx),
        { organizationId: query.organizationId },
      );
      const candidateWhere: Prisma.SourcingCandidateWhereInput = {
        ...where,
        ...(registeredCandidateIds.length > 0 ? { id: { notIn: registeredCandidateIds } } : {}),
      };
      return Promise.all([
        tx.sourcingCandidate.count({ where: candidateWhere }),
        tx.sourcingCandidate.findMany({
          where: candidateWhere,
          orderBy,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          },
        }),
      ]);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    // 페이지 전체의 등록 준비를 소유자 포트로 한 번에 읽는다.
    const registrations = await this.readCandidateRegistrations(
      query.organizationId,
      rows.map((row) => row.id),
    );
    return {
      total,
      items: rows.map((row) => ({
        ...hydrateCandidate(row, registrations.get(row.id)),
        registrationState: registrations.get(row.id)?.registrationState ?? 'none',
      })),
    };
  }

  /**
   * 후보마다 지금의 등록 상태. 초안 행이 아니라 울타리가 근거다(ADR-0014).
   *
   * 실행 장부는 Channels 것이라 등록된 리더로만 읽는다(ADR-0009). 초안의 제출 칸은
   * 울타리가 함께 갱신하는 거울이라, 그 둘이 갈라지면 화면이 거짓말을 한다.
   */
  private async readCandidateRegistrations(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Awaited<ReturnType<CandidateRegistrationPort['readForCandidates']>>> {
    if (candidateIds.length === 0) return new Map();
    if (!this.candidateRegistrations) {
      throw new Error('candidate_registration_port_missing');
    }
    return this.candidateRegistrations.readForCandidates(organizationId, candidateIds);
  }

  async archiveSourcedWorkspace(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string; archivedAt: Date },
  ): Promise<{ archivedCandidate: boolean; archivedCandidateImages: number }> {
    const prismaTx = tx as Prisma.TransactionClient;
    const candidate = await prismaTx.sourcingCandidate.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: 'sourced',
      },
      data: { isDeleted: true, deletedAt: input.archivedAt },
    });
    if (candidate.count === 0) {
      return { archivedCandidate: false, archivedCandidateImages: 0 };
    }
    const images = await prismaTx.candidateImage.updateMany({
      where: {
        candidateId: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data: { isDeleted: true, deletedAt: input.archivedAt },
    });
    return { archivedCandidate: true, archivedCandidateImages: images.count };
  }

  findCandidateState(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<SourcingCandidateStateRow | null> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.sourcingCandidate.findFirst({
      where: { id: input.id, organizationId: input.organizationId, isDeleted: false },
      select: { id: true, status: true },
    });
  }

  async lockCandidate(
    tx: SourcingRepositoryTransaction,
    input: { id: string; organizationId: string },
  ): Promise<void> {
    const prismaTx = tx as Prisma.TransactionClient;
    await prismaTx.$queryRaw`
      SELECT id FROM sourcing_candidates
      WHERE id = ${input.id}::uuid
        AND organization_id = ${input.organizationId}::uuid
      FOR UPDATE
    `;
  }

  rejectCandidate(
    tx: SourcingRepositoryTransaction,
    input: {
      id: string;
      organizationId: string;
      reason: string | null;
      rejectedByUserId: string | null;
      rejectedAt: Date;
    },
  ): Promise<{ count: number }> {
    const prismaTx = tx as Prisma.TransactionClient;
    return prismaTx.sourcingCandidate.updateMany({
      where: {
        id: input.id,
        organizationId: input.organizationId,
        isDeleted: false,
        status: 'sourced',
      },
      data: {
        status: 'rejected',
        rejectedAt: input.rejectedAt,
        rejectedReason: input.reason,
        rejectedByUserId: input.rejectedByUserId,
      },
    });
  }

  async findIdsBySourceIdentities(
    organizationId: string,
    identities: readonly {
      sourcePlatform: string;
      sourceIdentityHash: string | null;
      sourceUrl: string;
    }[],
  ): Promise<string[]> {
    if (identities.length === 0) return [];
    const hashes = [...new Set(identities
      .map((identity) => identity.sourceIdentityHash)
      .filter((hash): hash is string => Boolean(hash)))];
    const urls = [...new Set(identities.map((identity) => identity.sourceUrl).filter(Boolean))];
    const rows = await this.prisma.sourcingCandidate.findMany({
      where: {
        organizationId,
        isDeleted: false,
        status: 'sourced',
        OR: [
          ...(hashes.length > 0 ? [{ sourceIdentityHash: { in: hashes } }] : []),
          ...(urls.length > 0 ? [{ sourceUrl: { in: urls } }] : []),
        ],
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async readDraftSourceFacts(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<SalesProductDraftSourceFacts[]> {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const rows = await this.prisma.sourcingCandidate.findMany({
      where: { organizationId, id: { in: unique }, isDeleted: false },
      select: {
        id: true, name: true, description: true, sourcePlatform: true, sourceUrl: true,
        costCny: true, rawData: true,
        images: {
          where: { organizationId, isDeleted: false },
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          select: { url: true },
        },
      },
    });
    return rows.map((row) => ({
      candidateId: row.id,
      name: row.name,
      description: row.description,
      imageUrls: row.images.map((image) => image.url),
      sourcePlatform: row.sourcePlatform,
      sourceUrl: row.sourceUrl,
      costCny: row.costCny === null ? null : Number(row.costCny),
      rawBasics: (row.rawData as Record<string, unknown> | null) ?? null,
    }));
  }

  private async upsertSourcedInTransaction(input: UpsertCandidateInput): Promise<CandidateRow> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.idempotencyKey?.trim()) {
        await advisoryLock(tx, input.organizationId, 'sourcing-candidate', input.idempotencyKey);
      }
      return toRow(await upsertSourcedCandidateIn(tx, input));
    });
    await this.ensureDraft(input, row.id);
    return row;
  }

  /**
   * 수집한 상품의 편집 정본은 판매상품 초안이다(KID-310). 후보를 담은 트랜잭션이 커밋된 뒤에
   * Channels 에 초안을 부탁한다 — 멱등이라 다시 담아도 초안은 하나다.
   */
  private async ensureDraft(input: UpsertCandidateInput, candidateId: string): Promise<void> {
    await this.salesProductDrafts.createFromSource(input.organizationId, {
      candidateId,
      name: input.name,
      description: input.description ?? '',
      imageUrls: input.images.map((image) => image.url),
      sourcePlatform: input.sourcePlatform ?? null,
      sourceUrl: input.sourceUrl ?? null,
      costCny: input.costCny ?? null,
      rawBasics: (input.rawData as Record<string, unknown> | undefined) ?? null,
    });
  }

}

async function advisoryLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
  scope: string,
  ...rest: string[]
): Promise<void> {
  const lockKey = [scope, organizationId, ...rest].join(':');
  await tx.$queryRaw(
    // queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"`,
  );
}

function receiptCandidateResult(value: Prisma.JsonValue): { candidateId: string } {
  if (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).candidateId === 'string'
  ) {
    return { candidateId: (value as Record<string, string>).candidateId };
  }
  throw new Error('sourcing_owner_idempotency_receipt_invalid');
}

function hydrateCandidate(
  row: any,
  registration: { preparations: ProductPreparationRow[] } | undefined,
) {
  const productPreparations = registration?.preparations ?? [];
  return {
    ...toRow(row),
    images: row.images.map(toImageRow),
    registrationTarget: productPreparations[0] ?? null,
    productPreparations,
  };
}

function toRow(row: any): CandidateRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceUrl: row.sourceUrl,
    sourcePlatform: row.sourcePlatform,
    externalOfferId: row.externalOfferId,
    variantKeyNormalized: row.variantKeyNormalized,
    sourceIdentityHash: row.sourceIdentityHash,
    rawData: row.rawData,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: row.tags,
    thumbnailUrl: row.thumbnailUrl,
    imageUrl: row.imageUrl,
    costCny: row.costCny,
    status: row.status,
    rejectedReason: row.rejectedReason,
    rejectedAt: row.rejectedAt,
    rejectedByUserId: row.rejectedByUserId,
    triggeredByUserId: row.triggeredByUserId,
    isDeleted: row.isDeleted,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toImageRow(image: any): CandidateImageRow {
  return {
    id: image.id,
    organizationId: image.organizationId,
    candidateId: image.candidateId,
    url: image.url,
    storageKey: image.storageKey,
    role: image.role,
    label: image.label,
    sortOrder: image.sortOrder,
    source: image.source,
    isPrimary: image.isPrimary,
    isDeleted: image.isDeleted,
  };
}

function mergeJson(previous: unknown, incoming: object): object {
  const base = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  return { ...base, ...incoming };
}

function pruneUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2002',
  );
}
