import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  MALL_OPERATION_OUTCOME_FACT_SELECT,
  readMallOperationOutcomeSummaryFacts,
} from '../../../read/mall-operation-outcome.reader';
import type {
  MallOperationOutcomeCountRow,
  MallOperationOutcomeRepositoryPort,
  MallOperationOutcomeRow,
  RecordMallOperationOutcomeInput,
} from '../../../application/port/out/repository/mall-operation-outcome.repository.port';

/**
 * 관찰 기록 저장소. append-only 이고 모든 읽기 · 쓰기는 조직으로 울타리를 친다.
 *
 * 쓰기(와 같은 키 재읽기)만 여기서 하고, 요약 읽기는 등록 리더에 맡긴다.
 */
@Injectable()
export class MallOperationOutcomeRepositoryAdapter implements MallOperationOutcomeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordMallOperationOutcomeInput): Promise<MallOperationOutcomeRow> {
    const where = { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey };
    const existing = await this.prisma.mallOperationOutcome.findFirst({
      where,
      select: MALL_OPERATION_OUTCOME_FACT_SELECT,
    });
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
        },
        select: MALL_OPERATION_OUTCOME_FACT_SELECT,
      });
    } catch (error) {
      // 같은 키가 동시에 두 번 들어오면 늦은 쪽이 P2002 를 만난다. 먼저 쓴 줄을 돌려준다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.mallOperationOutcome.findFirst({
          where,
          select: MALL_OPERATION_OUTCOME_FACT_SELECT,
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  readSummary(input: { organizationId: string; since: Date }): Promise<{
    counts: readonly MallOperationOutcomeCountRow[];
    latest: readonly MallOperationOutcomeRow[];
  }> {
    return readMallOperationOutcomeSummaryFacts(this.prisma, input);
  }
}
