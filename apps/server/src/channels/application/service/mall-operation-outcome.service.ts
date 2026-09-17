import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  MALL_OPERATION_OUTCOMES,
  mallOperationOutcomeKey,
  type MallOperationKind,
  type MallOperationOutcomeCounts,
  type MallOperationOutcomeItem,
  type MallOperationOutcomeSummary,
  type MallOperationOutcomeValue,
  type RecordMallOperationOutcomeRequest,
} from '@kiditem/shared/mall-operation-outcomes';
import { kstInclusiveDaysStart } from '../../../common/kst';
import { getMallAdapterManifest } from '../../domain/mall/mall-adapter-manifest';
import {
  MALL_OPERATION_OUTCOME_REPOSITORY_PORT,
  type MallOperationOutcomeRepositoryPort,
  type MallOperationOutcomeRow,
} from '../port/out/repository/mall-operation-outcome.repository.port';

function emptyCounts(): MallOperationOutcomeCounts {
  return { succeeded: 0, empty: 0, attention: 0, failed: 0, cancelled: 0 };
}

function isOutcomeValue(value: string): value is MallOperationOutcomeValue {
  return (MALL_OPERATION_OUTCOMES as readonly string[]).includes(value);
}

// 저장할 때 shared z.enum 으로 검증한 값이라 읽을 때는 좁히기만 한다.
function toItem(row: MallOperationOutcomeRow): MallOperationOutcomeItem {
  return {
    id: row.id,
    mallKey: row.mallKey,
    operation: row.operation as MallOperationKind,
    outcome: row.outcome as MallOperationOutcomeValue,
    reasonCode: row.reasonCode,
    message: row.message,
    itemCount: row.itemCount,
    failedCount: row.failedCount,
    warningCount: row.warningCount,
    occurredAt: row.occurredAt.toISOString(),
  } satisfies MallOperationOutcomeItem;
}

/**
 * 쇼핑몰 에이전트의 관찰 기록 — 몰 작업 결과를 한 줄씩 쌓고 몰 · 작업별로 요약한다.
 *
 * 조직과 사람은 세션에서만 받는다. 몰 키는 매니페스트가 아는 몰이어야 한다. 같은
 * idempotencyKey 는 한 번만 쓴다. 계정 행을 함께 쓰는 몰(쿠팡직배송 → 로켓)은 그 행의
 * 채널로 접어 쌓는다 — 접는 규칙은 계약(`mallOperationOutcomeKey`)이 가지고, 화면도
 * 같은 함수로 읽는다.
 */
@Injectable()
export class MallOperationOutcomeService {
  constructor(
    @Inject(MALL_OPERATION_OUTCOME_REPOSITORY_PORT)
    private readonly repository: MallOperationOutcomeRepositoryPort,
  ) {}

  async record(
    organizationId: string,
    actorUserId: string | null,
    input: RecordMallOperationOutcomeRequest,
  ): Promise<MallOperationOutcomeItem> {
    // 매니페스트는 보낸 키 그대로 확인한다 — 접은 뒤에 확인하면 모르는 몰이 통과한다.
    if (!getMallAdapterManifest(input.mallKey)) {
      throw new BadRequestException(`알 수 없는 몰입니다: ${input.mallKey}`);
    }
    const row = await this.repository.record({
      organizationId,
      actorUserId,
      idempotencyKey: input.idempotencyKey,
      mallKey: mallOperationOutcomeKey(input.mallKey),
      operation: input.operation,
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      message: input.message ?? null,
      itemCount: input.itemCount ?? null,
      failedCount: input.failedCount ?? null,
      warningCount: input.warningCount ?? null,
    });
    return toItem(row);
  }

  /**
   * 오늘을 포함한 한국 날짜 `days`일 안에서 몰 · 작업마다 가장 최근 결과와 결과별 건수.
   * `days=1` 은 오늘 0시부터다 — 24시간 전부터로 세면 아침 화면에 어제 실패가 섞인다.
   */
  async summary(organizationId: string, days = 7, now: Date = new Date()): Promise<MallOperationOutcomeSummary> {
    const since = kstInclusiveDaysStart(days, now);
    const { counts, latest } = await this.repository.readSummary({ organizationId, since });
    const countsByKey = new Map<string, MallOperationOutcomeCounts>();
    let total = 0;
    for (const row of counts) {
      const key = `${row.mallKey}\u0000${row.operation}`;
      const bucket = countsByKey.get(key) ?? emptyCounts();
      if (isOutcomeValue(row.outcome)) bucket[row.outcome] += row.count;
      countsByKey.set(key, bucket);
      total += row.count;
    }
    return {
      since: since.toISOString(),
      days,
      total,
      rows: latest.map((row) => ({
        mallKey: row.mallKey,
        operation: row.operation as MallOperationKind,
        latest: toItem(row),
        counts: countsByKey.get(`${row.mallKey}\u0000${row.operation}`) ?? emptyCounts(),
      })),
    } satisfies MallOperationOutcomeSummary;
  }
}
