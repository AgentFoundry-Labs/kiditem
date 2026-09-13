import type { MallOperationOutcomeSummaryRow } from '@kiditem/shared/mall-operation-outcomes';
import type { OperationRun } from '@kiditem/shared/operations';
import type { PanelAlertItem, PanelItem, PanelRunItem } from '@kiditem/shared/panel';
import type { SellpiaInventoryFreshnessView } from '@kiditem/shared/sellpia-inventory-freshness';
import { isExpiredBrowserCollectionAlert } from '@/lib/browser-collection-session';
import {
  PIPE_STAGES,
  STAGE_BY_ALERT_TYPE,
  STAGE_BY_MALL_OPERATION,
  STAGE_BY_OPERATION_KEY,
  STAGE_BY_PANEL_RUN_SOURCE,
  STAGE_BY_PRODUCER,
  type PipeStageDef,
  type PipeStageId,
} from './pipe-stages';
import { pipeStateRank, worstPipeState, type PipeState } from './pipe-states';

/**
 * Agent Org 판정 — 지금 있는 기록만으로 단계마다 "어떤 상태인가"를 정한다.
 *
 * 읽는 것은 넷이다: 서버 실행 기록(OperationRun), 알림 스트림(브라우저 수집 · 콘텐츠 생성),
 * 몰 작업 기억(MallOperationOutcome), 셀피아 재고 신선도. 새 숫자를 지어내지 않는다 —
 * 셀 곳이 없는 단계는 `noSourceReason` 을 그대로 들고 '모름'으로 선다.
 *
 * 세 가지 원칙을 코드로 지킨다.
 * 1. **같은 대상은 최신 것만 상태가 된다.** 어제 실패한 수집이 오늘 성공했으면 빨강이 아니다.
 *    지난 실패는 예외 레인의 숫자로만 남는다.
 * 2. **원인이 같으면 한 장이다.** GS샵 로그인 만료가 수집 알림 · 몰 기억 · 자동 멈춤에 따로
 *    남아도 인박스에는 `login:gs-shop` 한 장으로 선다.
 * 3. **답을 못 들은 것은 고장이 아니다.** 확장 응답 시간 초과는 재시도 중이지 실패가 아니다.
 */

export interface PipeSource<T> {
  data: T | null;
  /** 불러오기에 실패했는가. 실패와 '아직 없음'을 구분해야 이유를 바르게 적는다. */
  failed: boolean;
}

export interface PipeMallAccount {
  key: string;
  name: string;
  enabled: boolean;
}

export interface PipeLoginBlock {
  mallKey: string;
  kind: 'login' | 'verification';
  reason: string;
  at: number;
}

/** 사장님 컨펌 — 최신 추천의 최종 후보와 결정 수(텔레그램 답장 포함). */
export interface PipeConfirmCounts {
  runId: string;
  generatedAt: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  /** 마지막으로 보고를 보낸 때. 모르면 `null`. */
  lastReportAt: string | null;
}

export interface PipeInputs {
  now: number;
  runs: PipeSource<readonly OperationRun[]>;
  outcomes: PipeSource<readonly MallOperationOutcomeSummaryRow[]>;
  malls: PipeSource<readonly PipeMallAccount[]>;
  freshness: PipeSource<SellpiaInventoryFreshnessView>;
  confirm: PipeSource<PipeConfirmCounts>;
  panelItems: readonly PanelItem[];
  loginBlocks: readonly PipeLoginBlock[];
}

type SignalSource = 'run' | 'alert' | 'outcome' | 'freshness' | 'confirm' | 'block' | 'derived';

export interface PipeSignal {
  id: string;
  stageId: PipeStageId;
  /** 같은 대상을 가리키는 열쇠. 대상마다 최신 신호 하나만 상태가 된다. */
  entityKey: string;
  source: SignalSource;
  /** `null` 이면 머리 상태를 바꾸지 않는다 — 사람이 취소한 실행처럼. */
  state: PipeState | null;
  at: number;
  title: string;
  reason: string | null;
  /** 인박스에서 같은 원인끼리 묶는 열쇠와 그 원인의 이름. */
  cause: { key: string; label: string } | null;
  /** 사람이 이어서 할 일이 있는가. */
  actionable: boolean;
  lane: { dir: 'rejoin' | 'exit'; label: string } | null;
  /** 이번에 처리한 건수. 모르면 `null`. */
  count: number | null;
}

export interface PipeChip {
  state: PipeState;
  count: number;
}

export interface PipeLaneEntry {
  label: string;
  count: number;
}

export interface PipeStageView {
  def: PipeStageDef;
  state: PipeState;
  /** 상태를 한 줄로. '모름'이면 왜 모르는지. */
  reason: string | null;
  lastAt: number | null;
  lastDoneAt: number | null;
  /** 가장 최근에 건수를 알려 준 기록의 건수. */
  lastCount: number | null;
  /** 이 단계에 셀 곳이 있는가. 없으면 화면이 숫자 자리에 '데이터 없음'을 쓴다. */
  measurable: boolean;
  chips: PipeChip[];
  lane: { rejoin: PipeLaneEntry[]; exit: PipeLaneEntry[] };
}

export interface PipeInboxItem {
  key: string;
  state: PipeState;
  title: string;
  detail: string | null;
  /** 같은 원인으로 묶인 기록 수. */
  count: number;
  stageIds: PipeStageId[];
  lastAt: number;
  href: string;
}

export interface PipeMallConnector {
  key: string;
  name: string;
  state: 'signed_in' | 'needs_login' | 'unknown';
}

export interface PipeConnectors {
  /** 켜 둔 몰 수. 몰 목록을 못 받았으면 `null`. */
  total: number | null;
  signedIn: number;
  needsLogin: number;
  unknown: number;
  needsLoginNames: string[];
  /** 몰마다 가장 최근 증거로 본 연결 상태. 쇼핑몰 박스가 몰 로고 옆에 쓴다. */
  malls: PipeMallConnector[];
}

/** 이번 판정에 쓴 기록의 양. 기억 박스가 보여 준다. 못 받았으면 `null`. */
export interface PipeSourceCounts {
  runs: number | null;
  outcomes: number | null;
  alerts: number;
}

export interface PipeFeedEntry {
  id: string;
  at: number;
  stageId: PipeStageId;
  title: string;
  state: PipeState | null;
  laneLabel: string | null;
}

export interface PipeSnapshot {
  stages: PipeStageView[];
  inbox: PipeInboxItem[];
  connectors: PipeConnectors;
  sources: PipeSourceCounts;
  header: { running: number; attention: number; failed: number; stale: number };
  feed: PipeFeedEntry[];
}

const BROWSER_COLLECTION_SOURCE = 'browser_collection_session';

/**
 * 확장이 옛 버전이라 그 작업을 처리할 코드가 없는 것. 실패가 아니라 '볼 수 없음'이다 —
 * 확장을 다시 불러오면 풀린다. 확장 런타임이 `attentionReason` 으로 올려 보낸다.
 */
const EXTENSION_ERROR_CODES = new Set(['browser_operation_handler_missing', 'extension_missing', 'extension_outdated']);

/** 서버가 사람 말 대신 코드만 준 경우. 코드를 그대로 이유 칸에 쓰면 읽을 수 없다. */
function readableReason(message: string | null | undefined): string | null {
  if (!message) return null;
  return /^[a-z][a-z0-9_]*$/.test(message) ? `확인이 필요한 상태입니다. (${message})` : message;
}

/** 사람이 몰에 직접 들어가야 풀리는 실행 오류. */
const LOGIN_ERROR_CODES = new Set([
  'marketplace_login',
  'marketplace_login_required',
  'security_challenge',
  'sellpia_login_required',
]);

/** 브라우저 수집이 멈춘 이유 중 로그인 · 보안 확인. */
const LOGIN_ATTENTION_REASONS = new Set(['marketplace_login', 'captcha', 'kiditem_auth', 'permission']);
/** 확장이 없거나 옛 버전이라 아예 볼 수 없는 것. */
const EXTENSION_ATTENTION_REASONS = new Set(['extension_missing', 'extension_outdated']);
/** 잠깐 막힌 것. 다시 물으면 대개 풀린다. */
const TRANSIENT_ATTENTION_REASONS = new Set(['background_timeout', 'rate_limited']);
/** 우리가 답을 못 들은 것 — 몰 실패가 아니다. */
const NO_ANSWER_REASON_CODES = new Set(['extension_timeout', 'extension_unavailable']);

const MALL_OPERATION_LABEL: Readonly<Record<string, string>> = {
  order_collection: '주문수집',
  sellpia_transfer: '셀피아 전송',
  tracking_upload: '송장 전송',
  registration_fill: '상품등록',
};

/** 인박스 제목을 고를 때 더 구체적인 기록을 앞세운다. */
const LABEL_PRIORITY: Readonly<Record<SignalSource, number>> = {
  block: 4,
  outcome: 3,
  freshness: 3,
  confirm: 3,
  derived: 2,
  alert: 1,
  run: 1,
};

/** 신호 단계가 이만큼 늦으면 오래됨이다. 기준 간격의 1.5배. */
const STALE_FACTOR = 1.5;

function time(value: string | Date | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(value: Record<string, unknown> | null, key: string): string | null {
  const field = value?.[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

/** 실행 결과의 `summary.accepted` — 이번에 받아들인 건수. 모르면 `null`. */
function acceptedCount(result: unknown): number | null {
  const accepted = record(record(result)?.summary)?.accepted;
  return typeof accepted === 'number' && Number.isFinite(accepted) ? accepted : null;
}

/* ── 기록 → 신호 ─────────────────────────────────────────────────────────── */

export function runSignal(run: OperationRun): PipeSignal | null {
  const stageId = STAGE_BY_OPERATION_KEY.get(run.operationKey);
  if (!stageId) return null;
  const base = {
    id: `run:${run.id}`,
    stageId,
    entityKey: `run:${run.operationKey}`,
    source: 'run' as const,
    at: time(run.finishedAt ?? run.updatedAt, time(run.createdAt)),
    title: run.title,
    count: acceptedCount(run.result),
  };
  switch (run.status) {
    case 'queued':
    case 'waiting_runtime':
    case 'waiting_dependency':
      return { ...base, state: 'queued', reason: null, cause: null, actionable: false, lane: null };
    case 'running':
      return { ...base, state: 'running', reason: null, cause: null, actionable: false, lane: null };
    case 'attention_required': {
      const code = run.error?.code ?? '';
      const message = run.error?.message ?? '';
      if (EXTENSION_ERROR_CODES.has(code) || EXTENSION_ERROR_CODES.has(message)) {
        return {
          ...base,
          state: 'unknown',
          reason: '확장에 이 작업이 없습니다. 확장을 최신으로 다시 불러오세요.',
          cause: { key: 'extension', label: '확장 연결 확인 필요' },
          actionable: true,
          lane: null,
        };
      }
      if (LOGIN_ERROR_CODES.has(code)) {
        return {
          ...base,
          state: 'blocked_external',
          reason: readableReason(run.error?.message),
          cause: { key: `login:${run.operationKey}`, label: `${run.title} · 로그인 필요` },
          actionable: true,
          lane: { dir: 'rejoin', label: '로그인하면 이어짐' },
        };
      }
      return {
        ...base,
        state: 'waiting_human',
        reason: readableReason(run.error?.message),
        cause: { key: `human:${run.operationKey}`, label: `${run.title} · 확인 필요` },
        actionable: true,
        lane: { dir: 'rejoin', label: '사람이 풀면 이어짐' },
      };
    }
    case 'succeeded': {
      const outcome = stringField(record(run.result), 'outcome');
      return {
        ...base,
        state: outcome === 'partial' ? 'partial' : 'done',
        reason: null,
        cause: null,
        actionable: false,
        lane: null,
      };
    }
    case 'failed':
      return {
        ...base,
        state: 'failed',
        reason: readableReason(run.error?.message),
        cause: { key: `fail:${run.operationKey}:${run.error?.code ?? 'unknown'}`, label: `${run.title} · 실패` },
        actionable: true,
        lane: { dir: 'exit', label: '실패' },
      };
    case 'cancelled':
      return { ...base, state: null, reason: null, cause: null, actionable: false, lane: { dir: 'exit', label: '취소' } };
    case 'skipped':
      return { ...base, state: 'skipped', reason: null, cause: null, actionable: false, lane: null };
    default:
      return null;
  }
}

function alertStage(alert: PanelAlertItem): PipeStageId | null {
  if (alert.sourceType === BROWSER_COLLECTION_SOURCE) {
    return (alert.sourceId && STAGE_BY_PRODUCER.get(alert.sourceId)) || null;
  }
  return (
    STAGE_BY_ALERT_TYPE.get(alert.type) ??
    (alert.operationKey ? STAGE_BY_OPERATION_KEY.get(alert.operationKey) : undefined) ??
    null
  );
}

export function alertSignal(
  alert: PanelAlertItem,
  now: number,
  mallName: (mallKey: string) => string,
): PipeSignal | null {
  const stageId = alertStage(alert);
  if (!stageId) return null;
  // 확장이 이미 지운 7일 넘은 수집, 정리하며 닫은 수집은 다시 세우지 않는다.
  if (isExpiredBrowserCollectionAlert(alert, now)) return null;
  if (alert.status === 'cancelled' && alert.metadata.staleReconciled === true) return null;

  const browser = alert.sourceType === BROWSER_COLLECTION_SOURCE;
  const mallKey = stringField(alert.metadata, 'mallKey');
  const attention = stringField(alert.metadata, 'attentionReason');
  const who = mallKey ? mallName(mallKey) : alert.title;
  const base = {
    id: `alert:${alert.id}`,
    stageId,
    entityKey: browser ? `alert:${alert.sourceId}:${mallKey ?? ''}` : `alert:${alert.type}:${alert.targetId ?? alert.id}`,
    source: 'alert' as const,
    at: time(alert.finishedAt ?? alert.startedAt, time(alert.createdAt)),
    title: alert.title,
    reason: alert.message,
    count: null,
  };
  // 사람이 이미 읽고 넘긴 알림은 사실로는 남기되 다시 조르지 않는다.
  const unread = !alert.isRead;

  switch (alert.status) {
    case 'running':
      return { ...base, state: 'running', cause: null, actionable: false, lane: null };
    case 'pending': {
      if (!browser) return { ...base, state: 'queued', cause: null, actionable: false, lane: null };
      if (attention && LOGIN_ATTENTION_REASONS.has(attention)) {
        const label = attention === 'captcha' ? '보안 확인 필요' : '로그인 필요';
        return {
          ...base,
          state: 'blocked_external',
          cause: { key: `login:${mallKey ?? alert.sourceId}`, label: `${who} · ${label}` },
          actionable: unread,
          lane: { dir: 'rejoin', label: '로그인하면 이어짐' },
        };
      }
      if (attention && EXTENSION_ATTENTION_REASONS.has(attention)) {
        return {
          ...base,
          state: 'unknown',
          reason: attention === 'extension_outdated' ? '확장이 옛 버전입니다.' : '확장을 찾지 못했습니다.',
          cause: { key: 'extension', label: '확장 연결 확인 필요' },
          actionable: unread,
          lane: null,
        };
      }
      if (attention && TRANSIENT_ATTENTION_REASONS.has(attention)) {
        return { ...base, state: 'retrying', cause: null, actionable: false, lane: { dir: 'rejoin', label: '다시 확인' } };
      }
      return {
        ...base,
        state: 'waiting_human',
        cause: { key: `human:${alert.sourceId}:${mallKey ?? ''}`, label: `${who} · 확인 필요` },
        actionable: unread,
        lane: { dir: 'rejoin', label: '사람이 풀면 이어짐' },
      };
    }
    case 'open':
      return {
        ...base,
        state: 'waiting_human',
        cause: { key: `human:${alert.type}:${alert.targetId ?? alert.id}`, label: alert.title },
        actionable: unread,
        lane: null,
      };
    case 'failed':
      return {
        ...base,
        state: 'failed',
        cause: { key: `fail:${alert.sourceId ?? alert.type}:${mallKey ?? ''}`, label: `${who} · 실패` },
        actionable: unread,
        lane: { dir: 'exit', label: '실패' },
      };
    case 'succeeded':
    case 'resolved':
      return { ...base, state: 'done', cause: null, actionable: false, lane: null };
    case 'cancelled':
      return { ...base, state: null, cause: null, actionable: false, lane: { dir: 'exit', label: '취소' } };
    default:
      return null;
  }
}

export function panelRunSignal(run: PanelRunItem): PipeSignal | null {
  const stageId = STAGE_BY_PANEL_RUN_SOURCE.get(run.source);
  if (!stageId) return null;
  const base = {
    id: `panel-run:${run.id}`,
    stageId,
    entityKey: `panel-run:${run.source}:${run.sourceId}`,
    source: 'alert' as const,
    at: time(run.updatedAt, time(run.createdAt)),
    title: run.title,
    reason: run.errorMessage ?? null,
    count: null,
  };
  switch (run.status) {
    case 'pending':
      return { ...base, state: 'queued', cause: null, actionable: false, lane: null };
    case 'running':
      return { ...base, state: 'running', cause: null, actionable: false, lane: null };
    case 'succeeded':
      return { ...base, state: 'done', cause: null, actionable: false, lane: null };
    case 'failed':
      return {
        ...base,
        state: 'failed',
        cause: { key: `fail:panel-run:${run.source}`, label: `${run.title} · 실패` },
        actionable: true,
        lane: { dir: 'exit', label: '실패' },
      };
    case 'cancelled':
      return { ...base, state: null, cause: null, actionable: false, lane: { dir: 'exit', label: '취소' } };
    default:
      return null;
  }
}

export function outcomeSignal(
  row: MallOperationOutcomeSummaryRow,
  mallName: (mallKey: string) => string,
): PipeSignal | null {
  const item = row.latest;
  const stageId = STAGE_BY_MALL_OPERATION.get(item.operation);
  if (!stageId) return null;
  const who = mallName(item.mallKey);
  const what = MALL_OPERATION_LABEL[item.operation] ?? item.operation;
  const base = {
    id: `outcome:${item.id}`,
    stageId,
    entityKey: `outcome:${item.mallKey}:${item.operation}`,
    source: 'outcome' as const,
    at: time(item.occurredAt),
    title: `${who} ${what}`,
    reason: item.message,
    count: item.itemCount,
  };
  switch (item.outcome) {
    case 'succeeded':
    case 'empty':
      return { ...base, state: 'done', cause: null, actionable: false, lane: null };
    case 'attention': {
      if (item.reasonCode === 'login_required') {
        return {
          ...base,
          state: 'blocked_external',
          cause: { key: `login:${item.mallKey}`, label: `${who} · 로그인 필요` },
          actionable: true,
          lane: { dir: 'rejoin', label: '로그인하면 이어짐' },
        };
      }
      if (item.reasonCode === 'operator_action_required' || item.reasonCode === 'verification_required') {
        return {
          ...base,
          state: 'blocked_external',
          cause: { key: `login:${item.mallKey}`, label: `${who} · 인증 필요` },
          actionable: true,
          lane: { dir: 'rejoin', label: '인증하면 이어짐' },
        };
      }
      const need =
        item.reasonCode === 'manual_submit_required'
          ? '제출 필요'
          : item.reasonCode === 'manual_upload_required'
            ? '업로드 필요'
            : item.reasonCode === 'no_credentials'
              ? '로그인 정보 없음'
              : '확인 필요';
      return {
        ...base,
        state: 'waiting_human',
        cause: { key: `human:${item.mallKey}:${item.operation}`, label: `${who} · ${need}` },
        actionable: true,
        lane: { dir: 'rejoin', label: '사람이 하면 이어짐' },
      };
    }
    case 'failed':
      if (item.reasonCode && NO_ANSWER_REASON_CODES.has(item.reasonCode)) {
        return { ...base, state: 'retrying', cause: null, actionable: false, lane: { dir: 'rejoin', label: '다음 바퀴에 다시 확인' } };
      }
      if (item.reasonCode === 'provider_contract_changed') {
        return {
          ...base,
          state: 'failed',
          cause: { key: `logic:${item.mallKey}:${item.operation}`, label: `${who} · ${what} 로직 점검 필요` },
          actionable: true,
          lane: { dir: 'exit', label: '로직 점검' },
        };
      }
      return {
        ...base,
        state: 'failed',
        cause: { key: `fail:${item.mallKey}:${item.operation}`, label: `${who} · ${what} 실패` },
        actionable: true,
        lane: { dir: 'exit', label: '실패' },
      };
    case 'cancelled':
      return { ...base, state: null, cause: null, actionable: false, lane: { dir: 'exit', label: '취소' } };
    default:
      return null;
  }
}

export function freshnessSignal(view: SellpiaInventoryFreshnessView): PipeSignal {
  const base = {
    id: 'freshness:sellpia',
    stageId: 'inventory' as const,
    entityKey: 'freshness:sellpia',
    source: 'freshness' as const,
    title: '셀피아 재고',
    count: null,
  };
  const lastAttemptAt = time(view.lastAttempt?.attemptedAt ?? null, time(view.lastVerifiedAt));
  switch (view.status) {
    case 'fresh':
      return { ...base, state: 'done', at: time(view.lastVerifiedAt), reason: null, cause: null, actionable: false, lane: null };
    case 'syncing':
      return { ...base, state: 'running', at: time(view.activeSync?.startedAt ?? null, lastAttemptAt), reason: null, cause: null, actionable: false, lane: null };
    case 'refresh_required':
      return {
        ...base,
        state: 'stale',
        at: time(view.lastVerifiedAt),
        reason: '마지막 확인이 기준 시간을 넘었습니다.',
        cause: { key: 'stale:sellpia', label: '셀피아 재고 · 새로고침 필요' },
        actionable: true,
        lane: null,
      };
    case 'failed':
    default: {
      const code = view.lastAttempt?.errorCode ?? null;
      if (code === 'sellpia_login_required') {
        return {
          ...base,
          state: 'blocked_external',
          at: lastAttemptAt,
          reason: view.lastAttempt?.errorMessage ?? null,
          cause: { key: 'login:sellpia', label: '셀피아 · 로그인 필요' },
          actionable: true,
          lane: { dir: 'rejoin', label: '로그인하면 이어짐' },
        };
      }
      return {
        ...base,
        state: 'failed',
        at: lastAttemptAt,
        reason: view.lastAttempt?.errorMessage ?? null,
        cause: { key: `fail:sellpia:${code ?? 'unknown'}`, label: '셀피아 재고 · 수집 실패' },
        actionable: true,
        lane: { dir: 'exit', label: '실패' },
      };
    }
  }
}

/**
 * 사장님 컨펌. 기다리는 후보가 있으면 사람 차례이고, 모두 결정됐으면 끝이다. 최종 후보가
 * 아예 없으면 건너뜀 — 컨펌할 것이 없는 것은 막힘이 아니다.
 */
export function confirmSignal(counts: PipeConfirmCounts): PipeSignal {
  const base = {
    id: `confirm:${counts.runId}`,
    stageId: 'gate' as const,
    entityKey: 'confirm:final',
    source: 'confirm' as const,
    title: '사장님 컨펌',
    at: Math.max(time(counts.generatedAt), time(counts.lastReportAt)),
    lane: null,
    count: counts.total,
  };
  if (counts.total === 0) {
    return { ...base, state: 'skipped', reason: '최종 후보가 없습니다.', cause: null, actionable: false };
  }
  const tally = `대기 ${counts.pending} · 승인 ${counts.approved} · 반려 ${counts.rejected}`;
  if (counts.pending > 0) {
    return {
      ...base,
      state: 'waiting_human',
      reason: tally,
      cause: { key: 'confirm:final', label: `사장님 컨펌 · 최종 후보 ${counts.pending}개 대기` },
      actionable: true,
    };
  }
  return { ...base, state: 'done', reason: tally, cause: null, actionable: false };
}

export function loginBlockSignal(block: PipeLoginBlock, mallName: (mallKey: string) => string): PipeSignal {
  const who = mallName(block.mallKey);
  const verification = block.kind === 'verification';
  return {
    id: `block:${block.mallKey}`,
    stageId: 'orders',
    entityKey: `block:${block.mallKey}`,
    source: 'block',
    state: 'blocked_external',
    at: block.at,
    title: `${who} 자동 로그인 멈춤`,
    reason: block.reason,
    cause: {
      key: `login:${block.mallKey}`,
      label: `${who} · 자동 멈춤, 직접 ${verification ? '인증' : '로그인'}`,
    },
    actionable: true,
    lane: { dir: 'rejoin', label: verification ? '인증하면 이어짐' : '로그인하면 이어짐' },
    count: null,
  };
}

/* ── 모으기 ───────────────────────────────────────────────────────────────── */

/** 대상마다 가장 최근 신호 하나. 상태와 인박스는 이것만 본다. */
function latestPerEntity(signals: readonly PipeSignal[]): PipeSignal[] {
  const latest = new Map<string, PipeSignal>();
  for (const signal of signals) {
    const current = latest.get(signal.entityKey);
    if (!current || signal.at > current.at) latest.set(signal.entityKey, signal);
  }
  return [...latest.values()];
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function laneEntries(signals: readonly PipeSignal[], dir: 'rejoin' | 'exit'): PipeLaneEntry[] {
  const counts = countBy(
    signals.filter((signal) => signal.lane?.dir === dir),
    (signal) => signal.lane!.label,
  );
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

/** 신호 단계가 기준보다 오래 성공이 없으면 '오래됨' 신호를 하나 더한다. */
function staleSignal(def: PipeStageDef, current: readonly PipeSignal[], now: number): PipeSignal | null {
  if (def.expectedEveryMs === null) return null;
  const lastDone = Math.max(
    0,
    ...current.filter((signal) => signal.state === 'done' || signal.state === 'partial').map((signal) => signal.at),
  );
  if (lastDone === 0) return null;
  if (now - lastDone <= def.expectedEveryMs * STALE_FACTOR) return null;
  return {
    id: `derived:stale:${def.id}`,
    stageId: def.id,
    entityKey: `derived:stale:${def.id}`,
    source: 'derived',
    state: 'stale',
    at: lastDone,
    title: `${def.title} 갱신 늦음`,
    reason: '마지막 성공이 하루를 넘었습니다.',
    cause: { key: `stale:${def.id}`, label: `${def.title} · 갱신 늦음` },
    actionable: true,
    lane: null,
    count: null,
  };
}

function stageSourceFailed(def: PipeStageDef, inputs: PipeInputs): boolean {
  return (
    (def.operationKeys.length > 0 && inputs.runs.failed) ||
    (def.mallOperations.length > 0 && inputs.outcomes.failed) ||
    (def.id === 'inventory' && inputs.freshness.failed) ||
    (def.id === 'gate' && inputs.confirm.failed)
  );
}

function buildStageView(
  def: PipeStageDef,
  all: readonly PipeSignal[],
  current: readonly PipeSignal[],
  inputs: PipeInputs,
): PipeStageView {
  const empty = { rejoin: [], exit: [] };
  if (def.noSourceReason) {
    return {
      def,
      state: 'unknown',
      reason: def.noSourceReason,
      lastAt: null,
      lastDoneAt: null,
      lastCount: null,
      measurable: false,
      chips: [],
      lane: empty,
    };
  }

  const history = all.filter((signal) => signal.stageId === def.id);
  const now = current.filter((signal) => signal.stageId === def.id);
  const stateful = now.filter((signal): signal is PipeSignal & { state: PipeState } => signal.state !== null);
  const head = worstPipeState(stateful.map((signal) => signal.state));

  const lastAt = history.length > 0 ? Math.max(...history.map((signal) => signal.at)) : null;
  const done = history.filter((signal) => signal.state === 'done' || signal.state === 'partial');
  const lastDoneAt = done.length > 0 ? Math.max(...done.map((signal) => signal.at)) : null;
  const counted = [...history].filter((signal) => signal.count !== null).sort((a, b) => b.at - a.at)[0];

  let reason: string | null;
  if (head === null) {
    reason = stageSourceFailed(def, inputs)
      ? '기록을 불러오지 못했습니다.'
      : def.operationKeys.length > 0
        ? '최근 실행 기록에 없습니다.'
        : '최근 기록이 없습니다.';
  } else {
    reason = stateful.filter((signal) => signal.state === head).sort((a, b) => b.at - a.at)[0]?.reason ?? null;
  }

  const chipCounts = countBy(
    stateful.filter((signal) => signal.state !== 'done' && signal.state !== 'skipped'),
    (signal) => signal.state,
  );
  const chips = [...chipCounts.entries()]
    .map(([state, count]) => ({ state: state as PipeState, count }))
    .sort((a, b) => pipeStateRank(a.state) - pipeStateRank(b.state));

  return {
    def,
    state: head ?? 'unknown',
    reason,
    lastAt,
    lastDoneAt,
    lastCount: counted?.count ?? null,
    measurable: true,
    chips,
    lane: { rejoin: laneEntries(history, 'rejoin'), exit: laneEntries(history, 'exit') },
  };
}

function buildInbox(current: readonly PipeSignal[]): PipeInboxItem[] {
  const groups = new Map<string, PipeSignal[]>();
  for (const signal of current) {
    if (!signal.actionable || signal.state === null) continue;
    const key = signal.cause?.key ?? `${signal.stageId}:${signal.state}:${signal.title}`;
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  }
  const stageOrder = new Map(PIPE_STAGES.map((stage, index) => [stage.id, index]));
  const hrefOf = new Map(PIPE_STAGES.map((stage) => [stage.id, stage.href ?? '/agent-org']));

  return [...groups.entries()]
    .map(([key, signals]) => {
      const state = worstPipeState(signals.map((signal) => signal.state!))!;
      const labelled = [...signals].sort(
        (a, b) => LABEL_PRIORITY[b.source] - LABEL_PRIORITY[a.source] || b.at - a.at,
      )[0]!;
      const newest = [...signals].sort((a, b) => b.at - a.at)[0]!;
      const stageIds = [...new Set(signals.map((signal) => signal.stageId))].sort(
        (a, b) => (stageOrder.get(a) ?? 0) - (stageOrder.get(b) ?? 0),
      );
      return {
        key,
        state,
        title: labelled.cause?.label ?? labelled.title,
        detail: newest.reason,
        count: signals.length,
        stageIds,
        lastAt: newest.at,
        href: hrefOf.get(stageIds[0]!) ?? '/',
      };
    })
    .sort((a, b) => pipeStateRank(a.state) - pipeStateRank(b.state) || b.lastAt - a.lastAt);
}

function buildConnectors(inputs: PipeInputs, mallName: (mallKey: string) => string): PipeConnectors {
  const accounts = inputs.malls.data?.filter((account) => account.enabled) ?? null;
  if (!accounts) return { total: null, signedIn: 0, needsLogin: 0, unknown: 0, needsLoginNames: [], malls: [] };

  const rows = inputs.outcomes.data ?? [];
  let signedIn = 0;
  let unknown = 0;
  const needsLoginNames: string[] = [];
  const malls: PipeMallConnector[] = [];
  for (const account of accounts) {
    // 가장 최근 증거가 이긴다 — 로그인 확인 성공이 차단보다 늦게 왔으면 차단은 낡은 것이다.
    const evidence: { at: number; signedIn: boolean }[] = [];
    for (const row of rows) {
      if (row.mallKey !== account.key) continue;
      const item = row.latest;
      const at = time(item.occurredAt);
      if (item.operation === 'login_check' || item.operation === 'login_test') {
        if (item.outcome === 'succeeded') evidence.push({ at, signedIn: true });
        else if (item.outcome === 'attention') evidence.push({ at, signedIn: false });
      } else if (item.operation === 'order_collection') {
        if (item.outcome === 'succeeded' || item.outcome === 'empty') evidence.push({ at, signedIn: true });
        else if (
          item.outcome === 'attention' &&
          (item.reasonCode === 'login_required' || item.reasonCode === 'operator_action_required')
        ) {
          evidence.push({ at, signedIn: false });
        }
      }
    }
    for (const block of inputs.loginBlocks) {
      if (block.mallKey === account.key) evidence.push({ at: block.at, signedIn: false });
    }
    const latest = evidence.sort((a, b) => b.at - a.at)[0];
    const name = mallName(account.key);
    if (!latest) {
      unknown += 1;
      malls.push({ key: account.key, name, state: 'unknown' });
    } else if (latest.signedIn) {
      signedIn += 1;
      malls.push({ key: account.key, name, state: 'signed_in' });
    } else {
      needsLoginNames.push(name);
      malls.push({ key: account.key, name, state: 'needs_login' });
    }
  }
  return { total: accounts.length, signedIn, needsLogin: needsLoginNames.length, unknown, needsLoginNames, malls };
}

export function buildPipeSnapshot(inputs: PipeInputs): PipeSnapshot {
  const names = new Map((inputs.malls.data ?? []).map((account) => [account.key, account.name]));
  const mallName = (mallKey: string) => names.get(mallKey) ?? mallKey;

  const signals: PipeSignal[] = [];
  for (const run of inputs.runs.data ?? []) {
    const signal = runSignal(run);
    if (signal) signals.push(signal);
  }
  for (const item of inputs.panelItems) {
    const signal = item.kind === 'alert' ? alertSignal(item, inputs.now, mallName) : panelRunSignal(item);
    if (signal) signals.push(signal);
  }
  for (const row of inputs.outcomes.data ?? []) {
    const signal = outcomeSignal(row, mallName);
    if (signal) signals.push(signal);
  }
  if (inputs.freshness.data) signals.push(freshnessSignal(inputs.freshness.data));
  if (inputs.confirm.data) signals.push(confirmSignal(inputs.confirm.data));
  for (const block of inputs.loginBlocks) signals.push(loginBlockSignal(block, mallName));

  const current = latestPerEntity(signals);
  for (const def of PIPE_STAGES) {
    const stale = staleSignal(def, current.filter((signal) => signal.stageId === def.id), inputs.now);
    if (stale) current.push(stale);
  }

  const stages = PIPE_STAGES.map((def) => buildStageView(def, signals, current, inputs));
  const inbox = buildInbox(current);
  const counted = (state: PipeState) => current.filter((signal) => signal.state === state).length;

  return {
    stages,
    inbox,
    connectors: buildConnectors(inputs, mallName),
    sources: {
      runs: inputs.runs.data?.length ?? null,
      outcomes: inputs.outcomes.data?.length ?? null,
      alerts: inputs.panelItems.filter((item) => item.kind === 'alert').length,
    },
    header: {
      running: counted('running'),
      attention: inbox.length,
      failed: counted('failed'),
      stale: counted('stale'),
    },
    feed: [...signals]
      .filter((signal) => signal.source !== 'derived' && signal.source !== 'block')
      .sort((a, b) => b.at - a.at)
      .slice(0, 16)
      .map((signal) => ({
        id: signal.id,
        at: signal.at,
        stageId: signal.stageId,
        title: signal.title,
        state: signal.state,
        laneLabel: signal.lane?.label ?? null,
      })),
  };
}

/**
 * 다이어그램 한 박스에 여러 단계를 담을 때 그 박스가 말할 상태.
 *
 * 사람이 먼저 봐야 할 상태가 앞선다. 다만 기록이 아예 없는 쪽의 '모름'이, 기록이 있는 쪽의
 * 진짜 활동을 가리지 않게 한다 — 상세페이지는 만들고 있는데 상품등록 실행 기록이 없다고
 * 박스 전체를 '모름'으로 칠하면 일하는 것이 안 보인다.
 */
export function mergeStageViews(views: readonly [PipeStageView, ...PipeStageView[]]): PipeStageView {
  const [primary, ...rest] = views;
  if (rest.length === 0) return primary;

  const informative = views.filter((view) => view.state !== 'unknown' || view.lastAt !== null);
  const state = worstPipeState(informative.map((view) => view.state)) ?? 'unknown';
  const deciding = (informative.length > 0 ? informative : views)
    .filter((view) => view.state === state)
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0];
  const latest = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? Math.max(...known) : null;
  };
  const counted = views
    .filter((view) => view.lastCount !== null)
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0];

  const chipCounts = new Map<PipeState, number>();
  for (const chip of views.flatMap((view) => view.chips)) {
    chipCounts.set(chip.state, (chipCounts.get(chip.state) ?? 0) + chip.count);
  }
  const mergeLane = (entries: PipeLaneEntry[]) => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + entry.count);
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  };

  return {
    def: primary.def,
    state,
    reason: deciding?.reason ?? primary.reason,
    lastAt: latest(views.map((view) => view.lastAt)),
    lastDoneAt: latest(views.map((view) => view.lastDoneAt)),
    lastCount: counted?.lastCount ?? null,
    measurable: views.some((view) => view.measurable),
    chips: [...chipCounts.entries()]
      .map(([chipState, count]) => ({ state: chipState, count }))
      .sort((a, b) => pipeStateRank(a.state) - pipeStateRank(b.state)),
    lane: {
      rejoin: mergeLane(views.flatMap((view) => view.lane.rejoin)),
      exit: mergeLane(views.flatMap((view) => view.lane.exit)),
    },
  };
}
