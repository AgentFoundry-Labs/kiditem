import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  candidateRegistrationState,
  readRegistrationExecutionFacts,
  registrationDraftState,
  type CandidateRegistrationState,
} from '../../../../channels/read/registration-execution.reader';
import { upsertSourcedCandidateIn, ensureSourcedCandidateImages } from './sourcing-candidate-upsert.transaction';
import type {
  CandidateImageRow,
  CandidateRow,
  ProductPreparationRow,
  SourcingCandidateRepositoryPort,
  SourcingCandidateStateRow,
  UpsertCandidateInput,
  UpsertCandidateWithIdempotencyReceiptInput,
} from '../../../application/port/out/repository/sourcing-candidate.repository.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class SourcingCandidateRepositoryAdapter implements SourcingCandidateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(
    operation: (tx: SourcingRepositoryTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction(
      (tx) => operation(tx as SourcingRepositoryTransaction),
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

  async updateManualBasics(input: {
    organizationId: string;
    candidateId: string;
    basics: Record<string, unknown>;
  }): Promise<boolean> {
    const existing = await this.prisma.sourcingCandidate.findFirst({
      where: {
        id: input.candidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      select: { rawData: true },
    });
    if (!existing) return false;
    // 부분 저장(예: 보기 모드 KC 이미지 단독 저장)이 이전에 저장한 키워드·가격을
    // 지우지 않도록 기존 manualBasics 에 병합한다. 전체 `수정` 저장은 모든 필드를
    // 보내므로 병합/치환 결과가 같다. 명시적으로 빈 값(예: keywords=[])이면 덮어쓴다.
    const priorRaw = existing.rawData && typeof existing.rawData === 'object' && !Array.isArray(existing.rawData)
      ? existing.rawData as Record<string, unknown>
      : {};
    const priorManual = priorRaw.manualBasics && typeof priorRaw.manualBasics === 'object' && !Array.isArray(priorRaw.manualBasics)
      ? priorRaw.manualBasics as Record<string, unknown>
      : {};
    const manualBasics = { ...priorManual, ...pruneUndefined(input.basics) };
    const data: Prisma.SourcingCandidateUpdateManyMutationInput = {
      rawData: mergeJson(existing.rawData, { manualBasics }) as Prisma.InputJsonValue,
    };
    // 후보 목록 카드/헤더는 실컬럼(name·category·description·tags)을 읽으므로
    // manualBasics 만이 아니라 컬럼도 함께 맞춰준다. 나머지 등록용 필드
    // (키워드·가격·KC 등)는 manualBasics 오버레이에만 남는다.
    if (typeof input.basics.name === 'string' && input.basics.name.trim()) {
      data.name = input.basics.name.trim();
    }
    if (typeof input.basics.category === 'string') {
      data.category = input.basics.category.trim() || null;
    }
    if (typeof input.basics.description === 'string') {
      data.description = input.basics.description;
    }
    if (Array.isArray(input.basics.tags)) {
      data.tags = input.basics.tags.filter(
        (tag): tag is string => typeof tag === 'string',
      ) as unknown as Prisma.InputJsonValue;
    }
    const result = await this.prisma.sourcingCandidate.updateMany({
      where: {
        id: input.candidateId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
      data,
    });
    return result.count > 0;
  }

  async findById(id: string, organizationId: string) {
    const row = await this.prisma.sourcingCandidate.findFirst({
      where: { id, organizationId, isDeleted: false },
      include: {
        images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
        productPreparations: {
          where: { organizationId, isDeleted: false },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!row) return null;
    const states = await this.readRegistrationStates(organizationId, [row]);
    return { ...hydrateCandidate(row), registrationState: states.get(row.id) ?? 'none' };
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
      channelListings: {
        none: { organizationId: query.organizationId, isActive: true },
      },
    };
    const orderBy =
      query.sort === 'oldest' ? { createdAt: 'asc' as const }
        : query.sort === 'name_asc' ? { name: 'asc' as const }
          : { createdAt: 'desc' as const };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sourcingCandidate.count({ where }),
      this.prisma.sourcingCandidate.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          images: { where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } },
          productPreparations: {
            where: { organizationId: query.organizationId, isDeleted: false },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          },
        },
      }),
    ]);
    // 페이지 전체를 한 번에 읽는다. 후보별 조회는 N+1 이다.
    const states = await this.readRegistrationStates(query.organizationId, rows);
    return {
      total,
      items: rows.map((row) => ({
        ...hydrateCandidate(row),
        registrationState: states.get(row.id) ?? 'none',
      })),
    };
  }

  /**
   * 후보마다 지금의 등록 상태. 초안 행이 아니라 울타리가 근거다(ADR-0014).
   *
   * 실행 장부는 Channels 것이라 등록된 리더로만 읽는다(ADR-0009). 초안의 제출 칸은
   * 울타리가 함께 갱신하는 거울이라, 그 둘이 갈라지면 화면이 거짓말을 한다.
   */
  private async readRegistrationStates(
    organizationId: string,
    rows: Array<{ id: string; productPreparations: Array<{ id: string; closedAt: Date | null; status?: string; channelListingId?: string | null }> }>,
  ): Promise<Map<string, CandidateRegistrationState>> {
    const candidateOf = new Map<string, string>();
    for (const row of rows) {
      for (const preparation of row.productPreparations) {
        candidateOf.set(preparation.id, row.id);
      }
    }
    const states = new Map<string, CandidateRegistrationState>();
    if (candidateOf.size === 0) return states;
    const facts = await readRegistrationExecutionFacts(this.prisma, {
      organizationId,
      productPreparationIds: [...candidateOf.keys()],
    });
    const byPreparation = new Map(facts.map((fact) => [fact.productPreparationId, fact]));
    for (const row of rows) {
      for (const preparation of row.productPreparations) {
        const execution = byPreparation.get(preparation.id);
        preparation.status = registrationDraftState(preparation.closedAt, execution);
        preparation.channelListingId = execution?.channelListingId ?? null;
      }
    }
    const byCandidate = new Map<string, typeof facts[number][]>();
    for (const fact of facts) {
      const candidateId = candidateOf.get(fact.productPreparationId);
      if (!candidateId) continue;
      const bucket = byCandidate.get(candidateId);
      if (bucket) bucket.push(fact);
      else byCandidate.set(candidateId, [fact]);
    }
    for (const [candidateId, candidateFacts] of byCandidate) {
      states.set(candidateId, candidateRegistrationState(candidateFacts));
    }
    return states;
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

  private upsertSourcedInTransaction(input: UpsertCandidateInput): Promise<CandidateRow> {
    return this.prisma.$transaction(async (tx) => {
      if (input.idempotencyKey?.trim()) {
        await advisoryLock(tx, input.organizationId, 'sourcing-candidate', input.idempotencyKey);
      }
      return toRow(await upsertSourcedCandidateIn(tx, input));
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

function hydrateCandidate(row: any) {
  const productPreparations = row.productPreparations.map(toProductPreparationRow);
  return {
    ...toRow(row),
    images: row.images.map(toImageRow),
    productPreparation: productPreparations[0] ?? null,
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

function toProductPreparationRow(preparation: any): ProductPreparationRow {
  return {
    id: preparation.id,
    sourceCandidateId: preparation.sourceCandidateId,
    channelAccountId: preparation.channelAccountId,
    sourceContentWorkspaceId: preparation.sourceContentWorkspaceId,
    channelListingId: preparation.channelListingId,
    displayName: preparation.displayName,
    status: preparation.status,
    selectedThumbnailUrl: preparation.selectedThumbnailUrl,
    selectedThumbnailGenerationId: preparation.selectedThumbnailGenerationId,
    selectedThumbnailGenerationCandidateId: preparation.selectedThumbnailGenerationCandidateId,
    selectedDetailPageArtifactId: preparation.selectedDetailPageArtifactId,
    selectedDetailPageRevisionId: preparation.selectedDetailPageRevisionId,
    selectedDetailPageGenerationId: preparation.selectedDetailPageGenerationId,
    registrationInput: preparation.registrationInput,
    createdAt: preparation.createdAt,
    updatedAt: preparation.updatedAt,
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
