import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MallOperationOutcomeCountRow,
  MallOperationOutcomeRepositoryPort,
  MallOperationOutcomeRow,
  RecordMallOperationOutcomeInput,
} from '../../../application/port/out/repository/mall-operation-outcome.repository.port';

const OUTCOME_SELECT = {
  id: true,
  mallKey: true,
  operation: true,
  outcome: true,
  reasonCode: true,
  message: true,
  itemCount: true,
  failedCount: true,
  warningCount: true,
  trigger: true,
  runId: true,
  occurredAt: true,
} as const;

/**
 * 몰 작업 결과(기억) 저장소. append-only 이고 모든 읽기 · 쓰기는 조직으로 울타리를 친다.
 */
@Injectable()
export class MallOperationOutcomeRepositoryAdapter implements MallOperationOutcomeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordMallOperationOutcomeInput): Promise<MallOperationOutcomeRow> {
    const where = { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey };
    const existing = await this.prisma.mallOperationOutcome.findFirst({ where, select: OUTCOME_SELECT });
    if (existing) return existing;
    try {
      return await this.prisma.mallOperationOutcome.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          mallKey: input.mallKey,
          operation: input.operation,
          outcome: input.outcome,
          reasonCode: input.reasonCode,
          message: input.message,
          itemCount: input.itemCount,
          failedCount: input.failedCount,
          warningCount: input.warningCount,
          trigger: input.trigger,
          runId: input.runId,
        },
        select: OUTCOME_SELECT,
      });
    } catch (error) {
      // 같은 키가 동시에 두 번 들어오면 늦은 쪽이 P2002 를 만난다. 먼저 쓴 줄을 돌려준다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.mallOperationOutcome.findFirst({ where, select: OUTCOME_SELECT });
        if (raced) return raced;
      }
      throw error;
    }
  }

  listRecent(input: {
    organizationId: string;
    limit: number;
    mallKey?: string;
    operation?: string;
  }): Promise<MallOperationOutcomeRow[]> {
    return this.prisma.mallOperationOutcome.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.mallKey ? { mallKey: input.mallKey } : {}),
        ...(input.operation ? { operation: input.operation } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: OUTCOME_SELECT,
    });
  }

  async countSince(input: { organizationId: string; since: Date }): Promise<MallOperationOutcomeCountRow[]> {
    const rows = await this.prisma.mallOperationOutcome.groupBy({
      by: ['mallKey', 'operation', 'outcome'],
      where: { organizationId: input.organizationId, occurredAt: { gte: input.since } },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      mallKey: row.mallKey,
      operation: row.operation,
      outcome: row.outcome,
      count: row._count._all,
    }));
  }

  latestSince(input: { organizationId: string; since: Date }): Promise<MallOperationOutcomeRow[]> {
    return this.prisma.mallOperationOutcome.findMany({
      where: { organizationId: input.organizationId, occurredAt: { gte: input.since } },
      orderBy: [{ mallKey: 'asc' }, { operation: 'asc' }, { occurredAt: 'desc' }],
      distinct: ['mallKey', 'operation'],
      select: OUTCOME_SELECT,
    });
  }
}
