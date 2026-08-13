import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  OperationCheckpointRepositoryPort,
  OperationRunCheckpointRecord,
} from '../../../application/port/out/repository/operation-checkpoint.repository.port';

@Injectable()
export class OperationCheckpointRepositoryAdapter
  implements OperationCheckpointRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async append(input: {
    organizationId: string;
    operationRunId: string;
    kind: string;
    state: Record<string, unknown>;
  }): Promise<OperationRunCheckpointRecord> {
    return this.prisma.$transaction(async (tx) => {
      const key = `operation-checkpoint:${input.organizationId}:${input.operationRunId}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
      );
      const run = await tx.operationRun.findFirst({
        where: {
          id: input.operationRunId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      if (!run) throw new Error('operation_run_checkpoint_scope_invalid');
      const latest = await tx.operationRunCheckpoint.aggregate({
        where: { operationRunId: input.operationRunId },
        _max: { sequence: true },
      });
      const row = await tx.operationRunCheckpoint.create({
        data: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
          sequence: (latest._max.sequence ?? 0n) + 1n,
          kind: input.kind,
          state: input.state as Prisma.InputJsonValue,
        },
      });
      return map(row);
    });
  }

  async findLatest(input: {
    organizationId: string;
    operationRunId: string;
  }): Promise<OperationRunCheckpointRecord | null> {
    const row = await this.prisma.operationRunCheckpoint.findFirst({
      where: {
        organizationId: input.organizationId,
        operationRunId: input.operationRunId,
      },
      orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
    });
    return row ? map(row) : null;
  }
}

function map(row: {
  id: string;
  organizationId: string;
  operationRunId: string;
  sequence: bigint;
  kind: string;
  state: Prisma.JsonValue;
  createdAt: Date;
}): OperationRunCheckpointRecord {
  if (typeof row.state !== 'object' || row.state === null || Array.isArray(row.state)) {
    throw new Error('operation_run_checkpoint_state_invalid');
  }
  return { ...row, state: row.state as Record<string, unknown> };
}
