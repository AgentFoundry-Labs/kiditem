import { Injectable } from '@nestjs/common';
import { SELLPIA_ORDER_TRANSFER_KIND } from '@kiditem/shared/orders-action-operations';
import { readOperationsByPlan } from '../../../../common/operation/transaction/operations-by-plan';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  SellpiaTransferOutcome,
  SellpiaTransferOutcomePort,
  SellpiaTransferOutcomeStatus,
  SellpiaTransferSourceRef,
} from '../../../application/port/in/capability/sellpia-transfer-outcome.port';

/**
 * 셀피아 전송 결과 capability(KID-388). 실행 표는 계약 리더(`readOperationsByPlan`)로만 읽는다
 * (ADR-0025, `check:operation-owner-boundary`). 원천마다 시작이 가장 늦은 전송 실행 하나의 상태를 비춘다.
 */
@Injectable()
export class SellpiaTransferOutcomePersistenceAdapter implements SellpiaTransferOutcomePort {
  constructor(private readonly prisma: PrismaService) {}

  async readLatestOutcomes(input: Parameters<SellpiaTransferOutcomePort['readLatestOutcomes']>[0]): Promise<SellpiaTransferOutcome[]> {
    const rows = await readOperationsByPlan(input.transaction ?? this.prisma, {
      organizationId: input.organizationId,
      kinds: [SELLPIA_ORDER_TRANSFER_KIND],
      planContainsAny: input.sources.map(({ sourceOperationId, transport }) => ({ sourceOperationId, transport })),
      plan: { payloadKeys: [] },
    });
    // 행은 시작 역순이다 — 원천마다 처음 만난 행이 가장 최근 실행이다.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const plan = row.plan as { sourceOperationId?: unknown; transport?: unknown } | null;
      if (typeof plan?.sourceOperationId !== 'string') continue;
      const key = sourceKey({
        sourceOperationId: plan.sourceOperationId,
        transport: typeof plan.transport === 'string' ? plan.transport as SellpiaTransferSourceRef['transport'] : null,
      });
      if (!latest.has(key)) latest.set(key, row);
    }
    return input.sources.map((source) => {
      const row = latest.get(sourceKey(source));
      return {
        source: { sourceOperationId: source.sourceOperationId, transport: source.transport },
        status: row ? outcomeStatus(row.status) : 'none',
        operationId: row?.id ?? null,
        finishedAt: row?.finishedAt ?? null,
      };
    });
  }
}

function sourceKey(source: SellpiaTransferSourceRef): string {
  return `${source.sourceOperationId}:${source.transport ?? ''}`;
}

function outcomeStatus(status: string): SellpiaTransferOutcomeStatus {
  switch (status) {
    case 'prepared':
    case 'executing':
      return 'in_progress';
    case 'reconciling':
      return 'reconciling';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      throw new Error(`Unknown operation status: ${status}`);
  }
}
