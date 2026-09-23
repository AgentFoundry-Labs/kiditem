import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { sourceRecordIdentityLockKey } from '../../../domain/source-record-identity';
import { admitSourceRecordWithDraftIn } from './source-record-admission.transaction';
import type { SalesProductDraftPort } from '../../../application/port/out/cross-domain/sales-product-draft.port';
import type {
  AdmittedSourceRecord,
  OwnerReceiptKey,
  SourceRecordRepositoryPort,
  SourceRecordWrite,
} from '../../../application/port/out/repository/source-record.repository.port';
import type {
  SourceRecordPort,
  SourceRecordView,
} from '../../../application/port/in/source-record.port';

const RECORD_SELECT = {
  id: true,
  sourcePlatform: true,
  sourceUrl: true,
  externalOfferId: true,
  name: true,
  description: true,
  category: true,
  costCny: true,
  rawData: true,
  createdAt: true,
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    select: { id: true, url: true, role: true, sortOrder: true, isPrimary: true },
  },
} satisfies Prisma.SourceRecordSelect;

type RecordRow = Prisma.SourceRecordGetPayload<{ select: typeof RECORD_SELECT }>;

/**
 * 원본 기록(SourceRecord) 저장소 — Sourcing 이 쓰는 입장 · 영수증과, Channels 가 부르는 읽기 ·
 * 초안 삭제(`SourceRecordPort`)를 함께 가진다(KID-313).
 *
 * 원본 기록은 수집이 남긴 불변 사실이라 고치는 길이 없다. 만들기는 입장(`admitSourceRecord`)만
 * 하고, 지우기는 초안 삭제가 부르는 `deleteForDraft` 뿐이다.
 */
@Injectable()
export class SourceRecordRepositoryAdapter implements SourceRecordRepositoryPort, SourceRecordPort {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(work: (transaction: OwnerTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(ownerTransaction(tx)));
  }

  async findIdBySourceUrl(organizationId: string, sourceUrl: string): Promise<string | null> {
    const row = await this.prisma.sourceRecord.findFirst({
      where: { organizationId, sourceUrl },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * 같은 원본을 두 요청이 동시에 담으면 advisory lock 이 줄을 세워 두 번째가 거절된다. 잠금 좌표가
   * 다른 쓰기가 유일키에 먼저 부딪히면 한 번 더 돌려 같은 거절(409)로 답한다.
   */
  async admit(input: SourceRecordWrite, drafts: SalesProductDraftPort): Promise<AdmittedSourceRecord> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => admitSourceRecordWithDraftIn(tx, input, drafts));
      } catch (error) {
        if (!isUniqueConstraintError(error) || attempt === 1) throw error;
      }
    }
  }

  admitOnce(
    receipt: OwnerReceiptKey,
    input: SourceRecordWrite,
    drafts: SalesProductDraftPort,
  ): Promise<AdmittedSourceRecord> {
    return this.runOnce<{ sourceRecordId: string; salesProductId: string }>(receipt, (transaction) =>
      admitSourceRecordWithDraftIn(ownerTransactionClient(transaction), input, drafts));
  }

  async runOnce<T extends Record<string, string>>(
    receipt: OwnerReceiptKey,
    work: (transaction: OwnerTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await advisoryLock(tx, receipt.organizationId, 'sourcing-owner-receipt', receipt.capabilityKey, receipt.idempotencyKey);
          const stored = await tx.sourcingOwnerIdempotencyReceipt.findFirst({
            where: {
              organizationId: receipt.organizationId,
              capabilityKey: receipt.capabilityKey,
              idempotencyKey: receipt.idempotencyKey,
            },
            select: { requestHash: true, result: true },
          });
          if (stored) {
            if (stored.requestHash !== receipt.requestHash) throw new Error('owner_idempotency_input_conflict');
            return stringRecord(stored.result) as T;
          }
          const result = await work(ownerTransaction(tx));
          await tx.sourcingOwnerIdempotencyReceipt.create({
            data: {
              organizationId: receipt.organizationId,
              capabilityKey: receipt.capabilityKey,
              idempotencyKey: receipt.idempotencyKey,
              requestHash: receipt.requestHash,
              result,
            },
          });
          return result;
        });
      } catch (error) {
        if (!isUniqueConstraintError(error) || attempt === 1) throw error;
      }
    }
  }

  async claimQuickProcess(input: {
    organizationId: string;
    salesProductId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ salesProductId: string }> {
    const result = await this.runOnce(
      { ...input, capabilityKey: 'sourcing.quick_process' },
      async () => ({ salesProductId: input.salesProductId }),
    );
    if (typeof result.salesProductId !== 'string') throw new Error('sourcing_owner_idempotency_receipt_invalid');
    return { salesProductId: result.salesProductId };
  }

  async read(input: { organizationId: string; sourceRecordId: string }): Promise<SourceRecordView | null> {
    const row = await this.prisma.sourceRecord.findFirst({
      where: { id: input.sourceRecordId, organizationId: input.organizationId },
      select: RECORD_SELECT,
    });
    return row ? toView(row) : null;
  }

  async readMany(input: {
    organizationId: string;
    sourceRecordIds: readonly string[];
  }): Promise<ReadonlyMap<string, SourceRecordView>> {
    const ids = [...new Set(input.sourceRecordIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.sourceRecord.findMany({
      where: { organizationId: input.organizationId, id: { in: ids } },
      select: RECORD_SELECT,
    });
    return new Map(rows.map((row) => [row.id, toView(row)]));
  }

  /**
   * 초안 삭제 트랜잭션 안에서 원본 기록을 지운다(사진은 외래키가 함께 지운다). 같은 원본의 입장과
   * 같은 식별자 잠금을 잡아, 지우는 사이에 재수집이 끼어들지 않게 한다. 이미 없으면 아무것도 하지
   * 않는다. 출시 후보가 이 기록을 증거로 들고 있으면 지우지 않는다 — 그 기록은 결정의 근거다.
   */
  async deleteForDraft(
    transaction: OwnerTransaction,
    input: { organizationId: string; sourceRecordId: string },
  ): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    const record = await tx.sourceRecord.findFirst({
      where: { id: input.sourceRecordId, organizationId: input.organizationId },
      select: { id: true, sourcePlatform: true, sourceIdentityHash: true },
    });
    if (!record) return;
    const key = sourceRecordIdentityLockKey({
      organizationId: input.organizationId,
      sourcePlatform: record.sourcePlatform,
      sourceIdentityHash: record.sourceIdentityHash,
    });
    await tx.$queryRaw(
      // queryraw-tenancy-exempt: organization-scoped advisory lock keyed by organizationId; reads no tenant data.
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS "lock"`,
    );
    try {
      await tx.sourceRecord.deleteMany({ where: { id: record.id, organizationId: input.organizationId } });
    } catch (error) {
      // 출시 후보가 이 기록을 증거로 든다(외래키 Restrict). 결정의 근거라 지우지 않는다.
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('출시 후보가 이 원본 기록을 근거로 들고 있어 초안을 지울 수 없습니다.');
      }
      throw error;
    }
  }
}

function toView(row: RecordRow): SourceRecordView {
  return {
    id: row.id,
    sourcePlatform: row.sourcePlatform,
    sourceUrl: row.sourceUrl,
    externalOfferId: row.externalOfferId,
    name: row.name,
    description: row.description,
    category: row.category,
    costCny: row.costCny === null ? null : row.costCny.toString(),
    rawData: row.rawData && typeof row.rawData === 'object' && !Array.isArray(row.rawData)
      ? row.rawData as Record<string, unknown>
      : {},
    images: row.images.map((image) => ({
      id: image.id,
      url: image.url,
      role: image.role,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    })),
    collectedAt: row.createdAt.toISOString(),
  };
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

/** 영수증 결과는 문자열 칸만 담는 객체다. 다른 모양이면 영수증이 망가진 것이다. */
function stringRecord(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sourcing_owner_idempotency_receipt_invalid');
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, entry]) => typeof entry !== 'string')) {
    throw new Error('sourcing_owner_idempotency_receipt_invalid');
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function isForeignKeyViolation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2003',
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'P2002',
  );
}
