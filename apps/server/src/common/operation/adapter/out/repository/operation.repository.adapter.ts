import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OperationStatusSchema,
  type OperationStagedChunk,
  type OperationWindow,
} from '@kiditem/shared/operation';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ownerTransaction, ownerTransactionClient } from '../../../../../prisma/owner-transaction';
import type { OwnerTransaction } from '../../../../owner-transaction';
import type { JsonObject } from '../../../application/port/out/owner/operation-owner.port';
import type {
  NewOperation,
  OperationClaimWrite,
  OperationClosure,
  OperationListFilter,
  OperationReschedule,
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
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    scheduledFor: row.scheduledFor,
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

  private insertOperation(operation: NewOperation) {
    return this.tx.operation.create({
      data: {
        organizationId: operation.organizationId,
        kind: operation.kind,
        status: operation.status,
        attempts: operation.attempts,
        maxAttempts: operation.maxAttempts,
        scheduledFor: operation.scheduledFor,
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
  }

  async create(operation: NewOperation) {
    const row = await this.insertOperation(operation);
    // 키마다 한 행씩, 호출자가 준 순서(정렬됨)대로 쓴다. 두 begin이 같은 순서로 잠그므로 교착하지 않는다.
    for (const lockKey of operation.lockKeys) {
      await this.tx.operationLock.create({
        data: { organizationId: operation.organizationId, lockKey, operationId: row.id },
      });
    }
    return { ...toRecord({ ...row, locks: [] }), lockKeys: [...operation.lockKeys] };
  }

  async createHeld(operation: NewOperation) {
    const row = await this.insertOperation(operation);
    for (const lockKey of operation.lockKeys) {
      // 먼저 잡은 트랜잭션이 커밋할 때까지 기다린 뒤, 그 키가 남아 있으면 아무것도 쓰지 않는다.
      const inserted = await this.tx.$executeRaw`
        INSERT INTO operation_locks (id, organization_id, lock_key, operation_id, created_at)
        VALUES (gen_random_uuid(), ${operation.organizationId}::uuid, ${lockKey}, ${row.id}::uuid, now())
        ON CONFLICT (organization_id, lock_key) DO NOTHING
      `;
      if (inserted === 0) return null;
    }
    return { ...toRecord({ ...row, locks: [] }), lockKeys: [...operation.lockKeys] };
  }

  async reschedule(organizationId: string, operationId: string, reschedule: OperationReschedule) {
    if (reschedule.clearStaging) await this.tx.operationChunk.deleteMany({ where: { operationId, organizationId } });
    await this.tx.operation.updateMany({
      where: { id: operationId, organizationId },
      data: {
        status: 'prepared',
        token: reschedule.token,
        scheduledFor: reschedule.scheduledFor,
        expiresAt: reschedule.scheduledFor,
        errorCode: reschedule.errorCode,
        errorMessage: reschedule.errorMessage,
        ...(reschedule.clearStaging ? { progress: Prisma.DbNull } : {}),
      },
    });
    const rescheduled = await this.read(organizationId, operationId);
    if (!rescheduled) throw new Error(`operation ${operationId} vanished while rescheduling`);
    return rescheduled;
  }

  async lockNextClaimable(kinds: readonly string[], now: Date) {
    // queryraw-tenancy-exempt: 워커 claim은 조직을 가로질러 가장 오래된 후보 하나를 집는다(KID-358). 집은 행의 조직으로 이후 쓰기를 건다.
    const rows = await this.tx.$queryRaw<Array<{ id: string; organization_id: string }>>`
      SELECT id, organization_id FROM operations
      WHERE kind = ANY(${[...kinds]}::text[])
        AND attempts < max_attempts
        AND (
          (status = 'prepared' AND (scheduled_for IS NULL OR scheduled_for <= ${now}))
          OR (status = 'executing' AND expires_at <= ${now})
        )
      ORDER BY COALESCE(scheduled_for, started_at) ASC, started_at ASC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return null;
    return this.read(rows[0].organization_id, rows[0].id);
  }

  async markClaimed(organizationId: string, operationId: string, claim: OperationClaimWrite) {
    await this.tx.operation.updateMany({
      where: { id: operationId, organizationId },
      data: { status: 'executing', token: claim.token, expiresAt: claim.expiresAt, attempts: { increment: 1 } },
    });
    const claimed = await this.read(organizationId, operationId);
    if (!claimed) throw new Error(`operation ${operationId} vanished while claiming`);
    return claimed;
  }

  async lockExhaustedExpired(filter: Parameters<OperationTransaction['lockExhaustedExpired']>[0]) {
    // queryraw-tenancy-exempt: 워커 claim의 조직 무관 만료 정리다(KID-358). 닫는 쓰기는 각 행의 조직으로 건다.
    const rows = await this.tx.$queryRaw<Array<{ id: string; organization_id: string }>>`
      SELECT id, organization_id FROM operations
      WHERE kind = ANY(${[...filter.kinds]}::text[])
        AND status = 'executing'
        AND expires_at <= ${filter.now}
        AND attempts >= max_attempts
      ORDER BY expires_at ASC, id ASC
      LIMIT ${filter.limit}
      FOR UPDATE SKIP LOCKED
    `;
    const records: OperationRecord[] = [];
    for (const { id, organization_id: organizationId } of rows) {
      const record = await this.read(organizationId, id);
      if (record) records.push(record);
    }
    return records;
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

/** 옛 카탈로그 종료 트랜잭션과 같은 값(KID-354). */
const OPERATION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

@Injectable()
export class OperationRepositoryAdapter implements OperationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: OperationTransaction) => Promise<T>, owner?: OwnerTransaction): Promise<T> {
    if (owner) return work(new PrismaOperationTransaction(ownerTransactionClient(owner)));
    // finish 트랜잭션은 owner finalize(원장 반영)를 품는다 — Wing 카탈로그 1,260건 반영은 Prisma 기본 5초를 넘는다.
    return this.prisma.$transaction((tx) => work(new PrismaOperationTransaction(tx)), OPERATION_TRANSACTION_OPTIONS);
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

  async find(organizationId: string, operationId: string) {
    const row = await this.prisma.operation.findFirst({ where: { id: operationId, organizationId }, include: withLocks });
    return row ? toRecord(row) : null;
  }
}
