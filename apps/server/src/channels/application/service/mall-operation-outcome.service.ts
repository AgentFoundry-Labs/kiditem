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
import { isChannelKey } from '@kiditem/shared/channel-registry';
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
 * 같은 함수로 읽는다. 이유 코드가 있는 줄은 글을 담지 않는다.
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
    // 레지스트리는 보낸 키 그대로 확인한다 — 접은 뒤에 확인하면 모르는 몰이 통과한다.
    // 몰 등록 매니페스트가 아니라 채널 레지스트리로 묻는다: 관찰 기록은 마켓 행
    // (쿠팡 로켓)에도 쌓이고, 그 행은 몰 등록 마법사에 서지 않는다.
    if (!isChannelKey(input.mallKey)) {
      throw new BadRequestException(`알 수 없는 몰입니다: ${input.mallKey}`);
    }
    // 이유 코드가 무슨 일인지 말하면 글은 담지 않는다. 몰이 돌려준 문장에는 아이디 ·
    // 주문번호가 섞여 들어오고("아이디(abc123)가 존재하지 않습니다"), 이 표는 개수와 이유
    // 코드만 갖는다. 부르는 쪽이 넘기더라도 표의 주인인 여기서 버린다.
    const reasonCode = input.reasonCode ?? null;
    const row = await this.repository.record({
      organizationId,
      actorUserId,
      idempotencyKey: input.idempotencyKey,
      mallKey: mallOperationOutcomeKey(input.mallKey),
      operation: input.operation,
      outcome: input.outcome,
      reasonCode,
      message: reasonCode ? null : input.message ?? null,
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
