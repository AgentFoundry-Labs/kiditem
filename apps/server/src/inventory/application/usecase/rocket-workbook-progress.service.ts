import { Inject, Injectable } from '@nestjs/common';
import type {
  RocketWorkbookProgressPort,
  RocketWorkbookWorkflowStatus,
} from '../port/in/stock/rocket-workbook-progress.port';
import {
  ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT,
  type RocketWorkbookProgressRepositoryPort,
} from '../port/out/persistence/rocket-workbook-progress.repository.port';

@Injectable()
export class RocketWorkbookProgressService implements RocketWorkbookProgressPort {
  constructor(
    @Inject(ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT)
    private readonly repository: RocketWorkbookProgressRepositoryPort,
  ) {}

  async read(
    input: Parameters<RocketWorkbookProgressPort['read']>[0],
  ): Promise<{
    status: RocketWorkbookWorkflowStatus;
    verifiedGeneration: bigint;
  }> {
    if (!input.allPositiveLinesCollected) {
      return {
        status: 'awaiting_coupang_confirmation',
        verifiedGeneration: input.exportGeneration ?? 0n,
      };
    }

    const snapshot = await this.repository.read({
      transaction: input.transaction,
      organizationId: input.organizationId,
      transmissionSources: input.transmissionSources,
    });
    const statuses = snapshot.transferStatuses;
    // 전송 실행이 없거나 가장 최근 실행이 실패·닫힘이면 그 파일은 다시 보낼 수 있다 — 수집된 상태로 돌아간다(KID-388).
    if (statuses.length === 0 || statuses.some((status) => status === 'none' || status === 'failed')) {
      return { status: 'orders_collected', verifiedGeneration: snapshot.verifiedGeneration };
    }
    if (statuses.some((status) => status !== 'succeeded')) {
      return { status: 'sellpia_transmitting', verifiedGeneration: snapshot.verifiedGeneration };
    }
    return { status: 'completed', verifiedGeneration: snapshot.verifiedGeneration };
  }
}
