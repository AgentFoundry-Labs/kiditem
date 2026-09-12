import type { MallOperationOutcomeItem } from '@kiditem/shared/mall-operation-outcomes';

/**
 * 서버가 아는 오늘의 몰별 수집 — 몰 카드의 '당일 · 신규'와 상태 줄이 읽는 값.
 *
 * 이 브라우저에 쌓인 파일 목록이 아니라 서버 기억(`MallOperationOutcome`)을 본다. 수집도
 * 셀피아 전송도 주문수집 화면 · 대시보드 버튼 · 자동 운전 고리 어디서 돌든 서버에 한 줄씩
 * 남으므로, 다른 PC 나 다른 브라우저에서 한 일도 같은 숫자 · 같은 상태로 보인다. 쇼핑몰 홈의
 * 몰별 상태와 같은 기록을 읽기 때문에 두 화면이 어긋나지 않는다.
 *
 * - **당일** = 오늘 마지막으로 성공한 수집의 건수. 같은 주문을 다시 수집해도 두 번 세지
 *   않으려고 합계를 쓰지 않는다.
 * - **신규** = 당일 − 오늘 셀피아로 보낸 건수(전송 기록 합계). 음수가 되지 않게 0 에서 멈춘다.
 * - **상태** = 오늘 마지막 수집 결과와 그 이유. 오늘 이미 받아 둔 주문이 있는데 마지막 시도만
 *   실패했으면 '마지막 수집 실패'라고 적는다 — 받은 주문이 사라진 것처럼 읽히지 않게.
 */
export interface ServerMallCollectionStat {
  mallKey: string;
  /** 오늘 마지막 성공 수집의 건수. 성공한 수집이 없으면 0. */
  orderRows: number;
  /** 오늘 셀피아로 보낸 건수(합계). */
  sentRows: number;
  /** 아직 셀피아로 보내지 않은 건수. */
  newRows: number;
  /** 오늘 마지막 수집 시각(성공 · 빈 수집 · 실패 모두). */
  latestAt: number;
  /** 오늘 마지막 수집 결과. */
  latestOutcome: MallOperationOutcomeItem['outcome'];
  /** 오늘 마지막 수집의 이유 코드(로그인 필요 등). */
  latestReasonCode: string | null;
  /** 오늘 마지막 수집이 남긴 사람 말 — 왜 그렇게 됐는지. */
  latestMessage: string | null;
  /**
   * 오늘 이 몰이 한 번이라도 제대로 돌았는가(성공 또는 빈 수집). 마지막 한 번을 놓친 것과
   * 하루 종일 못 하고 있는 것은 다른 일이라, 같은 빨간색으로 칠하면 구분이 사라진다.
   */
  normalToday: boolean;
  /** 오늘 돈 수집 횟수. */
  runs: number;
}

/** 몰이 실패한 게 아니라 우리가 답을 못 들은 것들. 다음 바퀴에 다시 물어보면 된다. */
const NO_ANSWER_REASONS = new Set(['extension_timeout', 'extension_unavailable']);

/** 카드에 띄울 한 줄. 사람이 이어서 해야 하면 `attention`, 몰이 막았으면 `failed`. */
export interface ServerMallCollectionStatus {
  label: string;
  tone: 'failed' | 'attention' | 'ok' | 'empty';
  /** 그 상태의 이유. 마우스를 올리면 보인다. */
  detail: string | null;
}

/** 이유 코드를 사람 말로. 쇼핑몰 홈의 몰별 상태와 같은 말을 쓴다. */
const ATTENTION_LABEL: Readonly<Record<string, string>> = {
  login_required: '로그인 필요',
  operator_action_required: '인증 필요',
  no_credentials: '계정 정보 없음',
  manual_upload_required: '업로드 필요',
  no_matching_orders: '맞는 주문 없음',
};

export function describeServerMallCollection(
  stat: ServerMallCollectionStat,
): ServerMallCollectionStatus {
  const detail = stat.latestMessage;
  switch (stat.latestOutcome) {
    case 'failed':
      // 우리 수집 코드가 몰 화면을 못 따라간 것 — 사람이 고쳐야 할 진짜 신호다. 묻히면 안 된다.
      if (stat.latestReasonCode === 'provider_contract_changed') {
        return { label: '수집 로직 점검 필요', tone: 'failed', detail };
      }
      // 확장이 답을 안 준 것은 몰 실패가 아니다. 오늘 제대로 돈 적이 있으면 다음 바퀴에
      // 다시 물어보면 되는 일이라, 하루 종일 못 하고 있는 몰과 같은 빨강으로 칠하지 않는다.
      if (stat.latestReasonCode && NO_ANSWER_REASONS.has(stat.latestReasonCode)) {
        return stat.normalToday
          ? { label: '응답 없음 · 다시 확인', tone: 'empty', detail }
          : { label: '응답 없음', tone: 'failed', detail };
      }
      // 오늘 이미 받아 둔 주문이 있으면 "마지막 시도만 실패"라고 정확히 말한다.
      return { label: stat.orderRows > 0 ? '마지막 수집 실패' : '수집 실패', tone: 'failed', detail };
    case 'attention':
      return {
        label: (stat.latestReasonCode && ATTENTION_LABEL[stat.latestReasonCode]) || '확인 필요',
        tone: 'attention',
        detail,
      };
    case 'empty':
      return { label: '신규 주문 없음', tone: 'empty', detail };
    case 'cancelled':
      return { label: '수집 취소', tone: 'empty', detail };
    default:
      return { label: '수집 성공', tone: 'ok', detail };
  }
}

function isSameLocalDay(timestamp: number, reference: Date): boolean {
  const value = new Date(timestamp);
  return (
    value.getFullYear() === reference.getFullYear() &&
    value.getMonth() === reference.getMonth() &&
    value.getDate() === reference.getDate()
  );
}

export function buildServerMallCollectionStats(
  items: readonly MallOperationOutcomeItem[],
  today: Date = new Date(),
): Map<string, ServerMallCollectionStat> {
  const byMall = new Map<string, ServerMallCollectionStat>();
  const latestSucceededAt = new Map<string, number>();
  const latestCollectionAt = new Map<string, number>();

  const ensure = (mallKey: string) => {
    const current = byMall.get(mallKey);
    if (current) return current;
    const created: ServerMallCollectionStat = {
      mallKey,
      orderRows: 0,
      sentRows: 0,
      newRows: 0,
      latestAt: 0,
      latestOutcome: 'empty',
      latestReasonCode: null,
      latestMessage: null,
      normalToday: false,
      runs: 0,
    };
    byMall.set(mallKey, created);
    return created;
  };

  for (const item of items) {
    const at = Date.parse(item.occurredAt);
    if (Number.isNaN(at) || !isSameLocalDay(at, today)) continue;

    if (item.operation === 'order_collection') {
      const stat = ensure(item.mallKey);
      stat.runs += 1;
      // 마지막 '수집' 결과만 상태로 쓴다 — 셀피아 전송 기록이 상태를 덮지 않게.
      if (at >= (latestCollectionAt.get(item.mallKey) ?? 0)) {
        latestCollectionAt.set(item.mallKey, at);
        stat.latestAt = at;
        stat.latestOutcome = item.outcome;
        stat.latestReasonCode = item.reasonCode;
        stat.latestMessage = item.message;
      }
      if (item.outcome === 'succeeded' || item.outcome === 'empty') stat.normalToday = true;
      if (item.outcome === 'succeeded' && at >= (latestSucceededAt.get(item.mallKey) ?? 0)) {
        latestSucceededAt.set(item.mallKey, at);
        stat.orderRows = item.itemCount ?? 0;
      }
      continue;
    }

    if (item.operation === 'sellpia_transfer' && item.outcome === 'succeeded') {
      const stat = ensure(item.mallKey);
      stat.sentRows += item.itemCount ?? 0;
    }
  }

  for (const stat of byMall.values()) {
    stat.newRows = Math.max(0, stat.orderRows - stat.sentRows);
  }

  return byMall;
}
