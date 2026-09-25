import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OperationStatusSchema,
  type OperationStagedChunk,
  type OperationWindow,
} from '@kiditem/shared/operation';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import type { JsonObject } from '../../../application/port/out/owner/operation-owner.port';
import type {
  NewOperation,
  OperationClosure,
  OperationListFilter,
  OperationRecord,
  OperationRepositoryPort,
  OperationTransaction,
} from '../../../application/port/out/repository/operation.repository.port';

const withLocks = { locks: { select: { lockKey: true } } } as const;
type OperationRow = Prisma.OperationGetPayload<{ include: typeof withLocks }>;

function toDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function toDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function jsonObject(value: Prisma.JsonValue | null): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function jsonInput(value: JsonObject | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function toRecord(row: OperationRow): OperationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind,
    status: OperationStatusSchema.parse(row.status),
    token: row.token,
    expiresAt: row.expiresAt,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    fileHash: row.fileHash,
    plan: jsonObject(row.plan),
    progress: jsonObject(row.progress),
    result: jsonObject(row.result),
    window: row.windowStart && row.windowEnd ? { start: toDay(row.windowStart), end: toDay(row.windowEnd) } : null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    lockKeys: row.locks.map((lock) => lock.lockKey),
  };
}

function windowColumns(window: OperationWindow | null | undefined) {
  if (window === undefined) return {};
  return { windowStart: window ? toDate(window.start) : null, windowEnd: window ? toDate(window.end) : null };
}

/** `operations`·`operation_chunks`·`operation_locks`의 유일한 어댑터(scripts/check-operation-owner-boundary.mjs). */
class PrismaOperationTransaction implements OperationTransaction {
  readonly ownerTransaction;

  constructor(private readonly tx: Prisma.TransactionClient) {
    this.ownerTransaction = ownerTransaction(tx);
  }

  private async read(organizationId: string, id: string): Promise<OperationRecord | null> {
    const row = await this.tx.operation.findFirst({ where: { id, organizationId }, include: withLocks });
    return row ? toRecord(row) : null;
  }

  async lockOperation(organizationId: string, operationId: string) {
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM operations
      WHERE id = ${operationId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
    return rows.length ? this.read(organizationId, operationId) : null;
  }

  async findByIdempotencyKey(organizationId: string, kind: string, idempotencyKey: string) {
    const row = await this.tx.operation.findFirst({ where: { organizationId, kind, idempotencyKey }, include: withLocks });
    return row ? this.lockOperation(organizationId, row.id) : null;
  }

  async findByFileHash(organizationId: string, kind: string, fileHash: string) {
    const row = await this.tx.operation.findFirst({ where: { organizationId, kind, fileHash }, include: withLocks });
    return row ? this.lockOperation(organizationId, row.id) : null;
  }

  async clearFileHash(organizationId: string, operationId: string) {
    await this.tx.operation.updateMany({ where: { id: operationId, organizationId }, data: { fileHash: null } });
  }

  async lockHolders(organizationId: string, lockKeys: readonly string[]) {
    if (lockKeys.length === 0) return [];
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT o.id FROM operations o
      WHERE o.organization_id = ${organizationId}::uuid
        AND EXISTS (
          SELECT 1 FROM operation_locks l
          WHERE l.operation_id = o.id
            AND l.organization_id = ${organizationId}::uuid
            AND l.lock_key = ANY(${[...lockKeys]}::text[])
        )
      ORDER BY o.id
      FOR UPDATE
    `;
    const holders: OperationRecord[] = [];
    for (const { id } of rows) {
      const holder = await this.read(organizationId, id);
      if (holder) holders.push(holder);
    }
    return holders;
  }

  async create(operation: NewOperation) {
    const row = await this.tx.operation.create({
      data: {
        organizationId: operation.organizationId,
        kind: operation.kind,
        status: 'executing',
        token: operation.token,
        expiresAt: operation.expiresAt,
        idempotencyKey: operation.idempotencyKey,
        requestHash: operation.requestHash,
        fileHash: operation.fileHash,
        plan: operation.plan as Prisma.InputJsonValue,
        ...windowColumns(operation.window),
        startedAt: operation.startedAt,
      },
    });
    // 키마다 한 행씩, 호출자가 준 순서(정렬됨)대로 쓴다. 두 begin이 같은 순서로 잠그므로 교착하지 않는다.
    for (const lockKey of operation.lockKeys) {
      await this.tx.operationLock.create({
        data: { organizationId: operation.organizationId, lockKey, operationId: row.id },
      });
    }
    return { ...toRecord({ ...row, locks: [] }), lockKeys: [...operation.lockKeys] };
  }

  async close(organizationId: string, operationId: string, closure: OperationClosure) {
    await this.tx.operationChunk.deleteMany({ where: { operationId, organizationId } });
    await this.tx.operationLock.deleteMany({ where: { operationId, organizationId } });
    await this.tx.operation.updateMany({
      where: { id: operationId, organizationId },
      data: {
        status: closure.status,
        errorCode: closure.errorCode,
        errorMessage: closure.errorMessage,
        result: jsonInput(closure.result),
        ...windowColumns(closure.window),
        finishedAt: closure.finishedAt,
      },
    });
    const closed = await this.read(organizationId, operationId);
    if (!closed) throw new Error(`operation ${operationId} vanished while closing`);
    return closed;
  }

  async findChunkChecksum(operationId: string, chunkKind: string, sequence: number) {
    const chunk = await this.tx.operationChunk.findUnique({
      where: { operationId_chunkKind_sequence: { operationId, chunkKind, sequence } },
      select: { checksum: true },
    });
    return chunk?.checksum ?? null;
  }

  countChunks(operationId: string) {
    return this.tx.operationChunk.count({ where: { operationId } });
  }

  async insertChunk(chunk: Parameters<OperationTransaction['insertChunk']>[0]) {
    await this.tx.operationChunk.create({
      data: { ...chunk, payload: chunk.payload as Prisma.InputJsonValue },
    });
  }

  async extendLease(organizationId: string, operationId: string, expiresAt: Date, progress?: JsonObject) {
    await this.tx.operation.updateMany({
      where: { id: operationId, organizationId, status: 'executing' },
      data: { expiresAt, ...(progress ? { progress: progress as Prisma.InputJsonValue } : {}) },
    });
  }

  async stagedChunks(operationId: string): Promise<OperationStagedChunk[]> {
    const chunks = await this.tx.operationChunk.findMany({
      where: { operationId },
      orderBy: [{ chunkKind: 'asc' }, { sequence: 'asc' }],
      select: { chunkKind: true, sequence: true, itemCount: true, payload: true },
    });
    return chunks.map((chunk) => ({
      chunkKind: chunk.chunkKind,
      sequence: chunk.sequence,
      itemCount: chunk.itemCount,
      payload: Array.isArray(chunk.payload) ? (chunk.payload as unknown[]) : [],
    }));
  }
}

@Injectable()
export class OperationRepositoryAdapter implements OperationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: OperationTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaOperationTransaction(tx)));
  }

  async expireDue(organizationId: string, kinds: readonly string[], now: Date, closure: OperationClosure) {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE operations
        SET status = ${closure.status}, error_code = ${closure.errorCode}, error_message = ${closure.errorMessage},
            finished_at = ${closure.finishedAt}, updated_at = ${now}
        WHERE organization_id = ${organizationId}::uuid
          AND kind = ANY(${[...kinds]}::text[])
          AND status = 'executing'
          AND expires_at <= ${now}
        RETURNING id
      `;
      const ids = expired.map((row) => row.id);
      if (ids.length) {
        await tx.operationChunk.deleteMany({ where: { organizationId, operationId: { in: ids } } });
        await tx.operationLock.deleteMany({ where: { organizationId, operationId: { in: ids } } });
      }
      return ids.length;
    });
  }

  async list(organizationId: string, filter: OperationListFilter) {
    const rows = await this.prisma.operation.findMany({
      where: { organizationId, kind: { in: filter.kinds }, ...(filter.status ? { status: filter.status } : {}) },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
      include: withLocks,
    });
    return rows.map(toRecord);
  }
}
