import type { AlertItem } from '@kiditem/shared/alerts';
import type {
  MallOperationKind,
  MallOperationOutcomeItem,
  MallOperationOutcomeSummaryRow,
} from '@kiditem/shared/mall-operation-outcomes';
import type { MallChannelSummary } from '@kiditem/shared/mall-publishing';
import { formatNumber } from '@/lib/utils';

/**
 * 쇼핑몰 알림 — 쇼핑몰 홈 오른쪽 알림판에 무엇이 서는가.
 *
 * 알림은 두 곳에서 온다.
 *
 *  1. **원천 실패 알림**(`/api/alerts`) — 몰에서 일하는 원천(몰 주문수집, 쿠팡 로켓 · 직배송
 *     수집, 쿠팡 윙 지표)이 끝내 실패하면 원천 하나에 알림 하나가 열리고, 그 원천이 다시
 *     성공하면 닫힌다. 전역 알림과 같은 쿼리에서 몰 일만 골라 읽는다.
 *  2. **지금 상태 알림** — 로그인 정보가 비어 있는 몰, 품절 후보, 쿠팡 발주확인 대기.
 *     저장하지 않는다. 화면을 열 때마다 API 에서 다시 센다. 모르면(못 받았으면) 세우지 않는다.
 *
 * 어느 몰 알림인지는 알림이 스스로 말할 때만 적는다. 쿠팡 원천은 원천 자체가 한 몰 것이고,
 * 몰 주문수집 원천은 알림이 몰을 말하지 않는다 — 제목 글자에서 몰 이름을 짐작하지 않는다.
 * 몰별 로그인 · 등록 폼 사정은 관찰 기록(MallOperationOutcome)이 말한다.
 */

/**
 * 몰에서 일하는 원천 → 그 원천이 일하는 몰. `null` 은 몰마다 달라서 알림이 몰을 말하지 않는다는 뜻.
 *
 * 광고(`coupang_ad_*`)는 마케팅 에이전트, 소싱은 소싱 에이전트 일이고, Sellpia 는 몰이 아니라
 * 재고 · 주문 허브라 여기 넣지 않는다.
 */
const MALL_SOURCE_TYPES = new Map<string, string | null>([
  ['order_collection_mall', null],
  ['coupang_shipment_summary', 'rocket'],
  ['coupang_rocket_po_catalog', 'rocket'],
  ['coupang_rocket_final_order', 'coupang-direct'],
  ['coupang_direct_order_capture', 'coupang-direct'],
  ['coupang_wing_traffic', 'coupang'],
  ['coupang_wing_itemwinner', 'coupang'],
]);

export type MallAlertState = 'attention' | 'done';
export type MallAlertFilter = 'all' | 'attention';
export type MallTileTone = 'failed' | 'attention' | 'running' | 'ok' | 'idle';

type ChannelFacts = Pick<MallChannelSummary, 'mallKey' | 'mallName' | 'hasCredentials'>;

export function isMallAlert(item: AlertItem): boolean {
  return item.sourceType !== null && MALL_SOURCE_TYPES.has(item.sourceType);
}

/** 알림이 말하는 몰. 알림이 몰을 말하지 않으면 `null` — 짐작하지 않는다. */
export function mallKeyOfAlert(item: AlertItem): string | null {
  if (item.sourceType === null || !MALL_SOURCE_TYPES.has(item.sourceType)) return null;
  return MALL_SOURCE_TYPES.get(item.sourceType) ?? null;
}

/** 열린 알림은 사람이 볼 실패, 닫힌 알림은 다시 성공한 일이다. */
export function mallAlertState(item: AlertItem): MallAlertState {
  return item.status === 'OPEN' ? 'attention' : 'done';
}

/** 사람이 아직 안 본 실패. 읽음으로 둔 알림은 다시 조르지 않는다. */
export function needsAttention(item: AlertItem): boolean {
  return mallAlertState(item) === 'attention' && !item.isRead;
}

export function alertTime(item: AlertItem): string {
  return item.updatedAt || item.createdAt;
}

export function statusWord(item: AlertItem): string {
  return item.status === 'OPEN' ? '실패' : '해결';
}

function listRank(item: AlertItem): number {
  if (needsAttention(item)) return 0;
  return mallAlertState(item) === 'attention' ? 1 : 2;
}

/** 알림 목록에서 몰 알림만 — 안 본 실패 먼저, 그다음 열린 것, 나머지는 최신순. */
export function mallAlertsFrom(alerts: readonly AlertItem[]): AlertItem[] {
  return alerts
    .filter(isMallAlert)
    .sort((a, b) => listRank(a) - listRank(b) || alertTime(b).localeCompare(alertTime(a)));
}

export function matchesAlertFilter(item: AlertItem, filter: MallAlertFilter): boolean {
  if (filter === 'attention') return needsAttention(item);
  return true;
}

/** 지금 상태에서 나온 알림. 저장하지 않는다. */
export interface DerivedMallAlert {
  id: string;
  title: string;
  message: string;
  href: string;
  hrefLabel: string;
  /** 이 알림이 말하는 몰. 비어 있으면 몰 하나에 매이지 않는 알림이다. */
  mallKeys: string[];
  /** 몰 타일에 쓸 짧은 상태. 몰에 매이지 않으면 `null`. */
  tileLabel: string | null;
  /**
   * 이 브라우저에만 있는 값(자동 로그인 차단)에서 나온 알림. 알림판과 몰 타일에는 보이지만
   * 위 칸 숫자에는 넣지 않는다 — 다른 사람 · 다른 브라우저가 같은 숫자를 볼 수 없다.
   */
  browserOnly?: true;
}

export interface DerivedMallAlertInput {
  /** 연결된 몰. 못 받았으면 `null` — 그때는 계정 알림을 세우지 않는다. */
  channels: readonly ChannelFacts[] | null;
  /** 확장이 확인한 결과 로그인이 풀린 몰. 확인하지 못한 몰은 넣지 않는다. */
  signedOut?: readonly Pick<ChannelFacts, 'mallKey' | 'mallName'>[];
  /**
   * 자동으로 더 시도하지 않는 몰 — 사람이 직접 해야 한다. 로그인 문제(아이디·비밀번호)와
   * 인증 문제(본인확인 · OTP · 캡차)는 할 일이 달라 종류를 함께 받는다.
   */
  manualLogin?: readonly (Pick<ChannelFacts, 'mallKey' | 'mallName'> & {
    kind?: 'login' | 'verification';
  })[];
  /** 품절 후보(판매 가능 재고 0 인 몰 옵션) 수. 못 받았으면 `null`. */
  soldOutTotal: number | null;
  /** 쿠팡 발주확인 대기 주문 수. 못 받았으면 `null`. */
  coupangPendingAccept: number | null;
}

const NAME_PREVIEW = 3;

function nameList(names: readonly string[]): string {
  const shown = names.slice(0, NAME_PREVIEW).join(', ');
  const rest = names.length - NAME_PREVIEW;
  return rest > 0 ? `${shown} 외 ${formatNumber(rest)}곳` : shown;
}

export function derivedMallAlerts({
  channels,
  signedOut = [],
  manualLogin = [],
  soldOutTotal,
  coupangPendingAccept,
}: DerivedMallAlertInput): DerivedMallAlert[] {
  const alerts: DerivedMallAlert[] = [];
  const noLogin = (channels ?? []).filter((channel) => !channel.hasCredentials);
  if (noLogin.length > 0) {
    alerts.push({
      id: 'derived:credentials',
      title: `로그인 정보가 비어 있는 몰 ${formatNumber(noLogin.length)}곳`,
      message: `${nameList(noLogin.map((channel) => channel.mallName))} — 아이디·비밀번호가 없으면 자동 로그인과 주문수집이 막힙니다.`,
      href: '/mall-settings',
      hrefLabel: '계정 설정',
      mallKeys: noLogin.map((channel) => channel.mallKey),
      tileLabel: '로그인 정보 없음',
    });
  }
  // 로그인 필요와 인증 필요는 사람이 할 일이 다르다 — 한 덩어리로 뭉개지 않는다.
  for (const group of [
    { kind: 'login' as const, id: 'derived:manual-login', word: '로그인' },
    { kind: 'verification' as const, id: 'derived:manual-verification', word: '인증' },
  ]) {
    const malls = manualLogin.filter((channel) => (channel.kind ?? 'login') === group.kind);
    if (malls.length === 0) continue;
    alerts.push({
      id: group.id,
      title: `직접 ${group.word}이 필요한 몰 ${formatNumber(malls.length)}곳`,
      message: `${nameList(malls.map((channel) => channel.mallName))} — 자동 ${group.word}을 더 시도하지 않습니다. 몰에서 직접 ${group.word}해 주세요.`,
      href: '/mall-settings',
      hrefLabel: '쇼핑몰 계정',
      mallKeys: malls.map((channel) => channel.mallKey),
      tileLabel: `직접 ${group.word} 필요`,
      browserOnly: true,
    });
  }
  if (signedOut.length > 0) {
    alerts.push({
      id: 'derived:session-expired',
      title: `로그인이 풀린 몰 ${formatNumber(signedOut.length)}곳`,
      message: `${nameList(signedOut.map((channel) => channel.mallName))} — 이 브라우저에서 몰 관리자에 로그인해야 수집 · 등록이 됩니다.`,
      href: '/mall-settings',
      hrefLabel: '로그인 테스트',
      mallKeys: signedOut.map((channel) => channel.mallKey),
      tileLabel: '로그인 필요',
    });
  }
  if (coupangPendingAccept !== null && coupangPendingAccept > 0) {
    alerts.push({
      id: 'derived:coupang-accept',
      title: `쿠팡 발주확인 대기 ${formatNumber(coupangPendingAccept)}건`,
      message: '쿠팡 주문 동기화로 들어온 주문 중 아직 발주확인 전인 주문입니다.',
      href: '/orders',
      hrefLabel: '주문 처리',
      mallKeys: ['coupang'],
      tileLabel: `발주확인 대기 ${formatNumber(coupangPendingAccept)}건`,
    });
  }
  if (soldOutTotal !== null && soldOutTotal > 0) {
    alerts.push({
      id: 'derived:sold-out',
      title: `품절 후보 ${formatNumber(soldOutTotal)}개`,
      message: '판매 가능 재고가 0 이 된 몰 옵션입니다. 품절 송신 경로가 아직 없어 몰에서 직접 품절 처리해야 합니다.',
      href: '/mall-availability',
      hrefLabel: '품절 관리',
      mallKeys: [],
      tileLabel: null,
    });
  }
  return alerts;
}

/**
 * 타일에 붙는 로그인 상태 — 확장이 조용히 확인한 결과.
 *
 * `verification` 은 확인 결과가 아니라 그 위에 덮이는 상태다. 세션은 살아 있는데(확장이
 * `signed_in` 을 본다) 몰이 본인확인 · OTP 를 요구해 주문을 못 보는 몰이 있다. 그때 '로그인됨'
 * 이라고 적으면 멀쩡한데 왜 안 되냐는 말이 된다 — 사장님이 하실 일은 인증이다.
 */
/** 로그인 칩. 확인한 몰은 로그인됨 · 인증 필요 · 로그인 필요 중 하나다. */
export type TileLoginState = 'checking' | 'signed_in' | 'signed_out' | 'verification';

/** 인증을 기다리는 중이라고 말하는 이유 코드들. */
const VERIFICATION_REASONS = new Set(['operator_action_required', 'verification_required']);

/** 몰별 상태 타일 한 장. */
export interface MallStatusTile {
  /** 로그인 상태. 확인하지 않았으면 `null`. */
  login: TileLoginState | null;
  mallKey: string;
  mallName: string;
  tone: MallTileTone;
  /** 한 줄 상태 — '주문 데이터 수집 실패', '로그인 정보 없음', '최근 기록 없음'. */
  label: string;
  /**
   * 그 상태의 이유 — 관찰 기록에 남은 메시지. 타일에 마우스를 올리면 보인다. 라벨만으로는
   * "왜 실패했는지"를 알 수 없어 사람이 몰을 열어 보는 수밖에 없었다.
   */
  detail?: string | null;
  /** 상태가 나온 알림 시각. 지금 상태에서 나왔거나 기록이 없으면 `null`. */
  at: string | null;
  /** 이 몰에서 사람이 봐야 하는 알림 수(지금 상태 알림 포함). */
  attentionCount: number;
}

const TONE_RANK: Record<MallTileTone, number> = { failed: 0, attention: 1, running: 2, ok: 3, idle: 4 };

function toneOf(item: AlertItem): MallTileTone {
  return item.status === 'OPEN' ? 'failed' : 'ok';
}

const OPERATION_LABEL: Record<MallOperationKind, string> = {
  registration_fill: '상품등록',
  login_test: '로그인 테스트',
  login_check: '로그인 확인',
};

/** 사람이 이어서 할 일을 이유 코드에서 한 마디로. */
const ATTENTION_WORD: Readonly<Record<string, string>> = {
  login_required: '로그인 필요',
  operator_action_required: '인증 필요',
  manual_submit_required: '제출 필요',
  manual_upload_required: '업로드 필요',
  no_credentials: '로그인 정보 없음',
  no_matching_orders: '맞는 주문 없음',
  verification_required: '본인확인 필요',
};

/**
 * 실패라고 다 같은 실패가 아니다.
 * - 확장이 답을 안 준 것은 몰이 실패한 게 아니라 우리가 못 들은 것이다 — 다음에 다시 묻는다.
 * - 몰 화면을 못 따라간 것은 **우리 코드를 고쳐야 하는 일**이다. '실패'로 뭉개면 묻힌다.
 */
const FAILURE_WORD: Readonly<Record<string, string>> = {
  extension_timeout: '응답 없음',
  extension_unavailable: '확장 없음',
  provider_contract_changed: '수집 로직 점검 필요',
};

function outcomeWord(item: MallOperationOutcomeItem): string {
  switch (item.outcome) {
    case 'succeeded':
      return item.itemCount && item.itemCount > 0 ? `성공 · ${formatNumber(item.itemCount)}건` : '성공';
    case 'empty':
      return '할 일 없음';
    case 'attention':
      return (item.reasonCode && ATTENTION_WORD[item.reasonCode]) || '확인 필요';
    case 'failed':
      return (item.reasonCode && FAILURE_WORD[item.reasonCode]) || '실패';
    default:
      return '취소';
  }
}

/** 관찰 기록 한 줄을 사람 말로 — '로그인 확인 로그인 필요', '상품등록 제출 필요'. */
export function outcomeLabel(item: MallOperationOutcomeItem): string {
  return `${OPERATION_LABEL[item.operation]} ${outcomeWord(item)}`;
}

/** 답을 못 들은 것은 고장이 아니다 — 다음 바퀴가 다시 묻는다. 빨강 대신 '확인 필요'로 둔다. */
const NO_ANSWER_REASONS = new Set(['extension_timeout', 'extension_unavailable']);

function outcomeTone(item: MallOperationOutcomeItem): MallTileTone {
  if (item.outcome === 'failed') {
    return item.reasonCode && NO_ANSWER_REASONS.has(item.reasonCode) ? 'attention' : 'failed';
  }
  if (item.outcome === 'attention') return 'attention';
  return item.outcome === 'cancelled' ? 'idle' : 'ok';
}

type TileState = Pick<MallStatusTile, 'tone' | 'label' | 'detail'> & {
  at: string;
  /**
   * 사람이 이어서 할 일을 이름으로 부르는가('인증 필요', '로그인 필요'). 같은 일이 알림과
   * 관찰 기록에 두 번 남는데, 알림 쪽은 '확인 필요'라고만 해서 무엇을 해야 하는지 말하지 못한다.
   */
  actionable: boolean;
};

/** 고르기에만 쓰는 `actionable` 은 타일에 싣지 않는다. */
function asTile({ actionable: _actionable, ...rest }: TileState): Omit<TileState, 'actionable'> {
  return rest;
}

/**
 * 연결된 몰마다 지금 어떤가. 몰 알림의 가장 최근 일과 관찰 기록(몰 · 작업마다 가장 최근 결과)을
 * 함께 본다. 그중 가장 최근의 실패 · 멈춤이 먼저고, 다음이 지금 상태 알림(로그인 정보 없음
 * 등), 그다음이 가장 최근 결과다. 기록이 없으면 '최근 기록 없음'. 문제 있는 몰부터 둔다.
 */
export function mallStatusTiles(
  channels: readonly ChannelFacts[],
  alerts: readonly AlertItem[],
  derived: readonly DerivedMallAlert[],
  outcomes: readonly MallOperationOutcomeSummaryRow[] = [],
  sessions: Readonly<Record<string, TileLoginState>> = {},
): MallStatusTile[] {
  const byMall = new Map<string, AlertItem[]>();
  for (const alert of alerts) {
    const mallKey = mallKeyOfAlert(alert);
    if (!mallKey) continue;
    byMall.set(mallKey, [...(byMall.get(mallKey) ?? []), alert]);
  }
  const rememberedByMall = new Map<string, MallOperationOutcomeSummaryRow[]>();
  for (const row of outcomes) {
    rememberedByMall.set(row.mallKey, [...(rememberedByMall.get(row.mallKey) ?? []), row]);
  }
  return channels
    .map((channel): MallStatusTile => {
      const own = [...(byMall.get(channel.mallKey) ?? [])].sort((a, b) =>
        alertTime(b).localeCompare(alertTime(a)),
      );
      const current = derived.filter((alert) => alert.mallKeys.includes(channel.mallKey));
      const login = sessions[channel.mallKey] ?? null;
      // 방금 확인한 로그인 상태가 있으면 지난 로그인 확인 기록은 접는다 — 칩과 알림이 지금을 말한다.
      const fresh = login === 'signed_in' || login === 'signed_out' || login === 'verification';
      const remembered = (rememberedByMall.get(channel.mallKey) ?? []).filter(
        (row) => !(fresh && row.operation === 'login_check'),
      );
      const alertAttention = own.filter(needsAttention).length;
      const rememberedProblems = remembered.filter((row) => {
        const tone = outcomeTone(row.latest);
        return tone === 'failed' || tone === 'attention';
      }).length;
      // 세션은 살아 있어도 몰이 인증을 요구하면 '로그인됨'이 아니라 '인증 필요'라고 적는다.
      const awaitingVerification = remembered.some(
        (row) =>
          row.latest.outcome === 'attention' &&
          row.latest.reasonCode !== null &&
          VERIFICATION_REASONS.has(row.latest.reasonCode),
      );
      const base = {
        mallKey: channel.mallKey,
        mallName: channel.mallName,
        attentionCount: alertAttention + current.length + rememberedProblems,
        login: awaitingVerification && login !== 'checking' ? ('verification' as const) : login,
      };
      const latestAlert = own[0];
      const states: TileState[] = [
        ...remembered.map((row) => ({
          tone: outcomeTone(row.latest),
          label: outcomeLabel(row.latest),
          // 왜 그렇게 됐는지 — 관찰 기록에 남은 짧은 사유. 타일 툴팁으로 보여 준다.
          detail: row.latest.message,
          at: row.latest.occurredAt,
          actionable: Boolean(row.latest.reasonCode && ATTENTION_WORD[row.latest.reasonCode]),
        })),
        ...(latestAlert
          ? [{
              tone: toneOf(latestAlert),
              label: `${latestAlert.title} ${statusWord(latestAlert)}`,
              detail: latestAlert.message,
              at: alertTime(latestAlert),
              actionable: false,
            }]
          : []),
      ].sort((a, b) => b.at.localeCompare(a.at));
      // 문제가 여럿이면 **할 일을 이름으로 부르는 쪽**을 고른다. 같은 사건이 알림과 관찰 기록에
      // 두 번 남는데, 몇 초 늦게 찍힌 알림이 '확인 필요'라고만 해서 이기면 사장님은 인증이
      // 필요한지 로그인이 필요한지 알 수 없다.
      const problems = states.filter((state) => state.tone === 'failed' || state.tone === 'attention');
      const problem = problems.find((state) => state.actionable) ?? problems[0];
      if (problem) return { ...base, ...asTile(problem) };
      const tileLabel = current.find((alert) => alert.tileLabel !== null)?.tileLabel;
      if (tileLabel) return { ...base, tone: 'attention', label: tileLabel, at: null };
      const latest = states[0];
      if (latest) return { ...base, ...asTile(latest) };
      return { ...base, tone: 'idle', label: '최근 기록 없음', at: null };
    })
    .sort(
      (a, b) =>
        TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
        b.attentionCount - a.attentionCount ||
        a.mallName.localeCompare(b.mallName, 'ko'),
    );
}

export interface MallAlertCounts {
  attention: number;
}

export function mallAlertCounts(
  alerts: readonly AlertItem[],
  derived: readonly DerivedMallAlert[],
): MallAlertCounts {
  return {
    attention: alerts.filter(needsAttention).length
      + derived.filter((alert) => !alert.browserOnly).length,
  };
}
