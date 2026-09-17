import type { CapabilityKey, CapabilityTotals } from '../../_shared/mall-capabilities';
import { formatNumber } from '@/lib/utils';
import type { MallAgentMission, MissionStatus } from './mall-agent-missions';

/**
 * 쇼핑몰 에이전트 파이프라인 — 에이전트가 일하는 순서와, 단계마다 그 단계의 일.
 *
 * 미션(무엇을 해내나) → 감지(무엇을 보고 움직이나) → 판단(무엇을 할지 고르나) → 도구(실제로
 * 무엇을 하나) → 사람 승인(되돌리기 어려운 일은 누가 누르나) → 기억(해 본 일을 쌓아 배우나).
 * 기억은 다음 판단으로 돌아가 에이전트를 나아지게 한다.
 *
 * 일마다 상태(됨 · 일부 · 아직)는 **지금 코드가 실제로 하는 일** 기준이고, 단계 상태는 그
 * 아래 일들을 모은 것이다 — 다 되면 됨, 하나라도 되면 일부, 하나도 없으면 아직. 숫자는 홈의
 * 다른 칸과 같은 판정에서 읽고, 못 받은 숫자는 지어내지 않는다.
 */
export type PipelineStageKey = 'mission' | 'sense' | 'decide' | 'act' | 'approve' | 'remember';

export interface PipelineItem {
  id: string;
  title: string;
  status: MissionStatus;
  /** 지금 실제로 되는 것 — 숫자가 있으면 숫자로. */
  detail: string;
  href: { path: string; label: string } | null;
}

export interface PipelineStage {
  key: PipelineStageKey;
  name: string;
  /** 이 단계가 답하는 물음. */
  question: string;
  /** 아래 일들을 모은 상태. */
  status: MissionStatus;
  /** 아래 일 수와 상태별 수. */
  tally: string;
  /** 단계 머리에 붙는 한 줄. */
  note: string | null;
  /** 이 단계의 일. 미션 단계는 비어 있고 미션 목록이 대신 선다. */
  items: PipelineItem[];
}

export interface AgentPipelineInput {
  missions: readonly MallAgentMission[];
  /** 몰 작업 알림(서버) — 전체와 확인 필요. 못 받았으면 `null`. */
  alerts: { total: number; attention: number } | null;
  noLoginCount: number | null;
  /** 몰 로그인 상태(확장이 조용히 확인한 결과) — 몰 수. 다 확인하기 전이면 `null`. */
  sessions: { signedIn: number; verification: number; signedOut: number } | null;
  soldOutTotal: number | null;
  coupangPendingAccept: number | null;
  /** 아직 열린 몰 원천 실패 알림 수. 못 받았으면 `null`. */
  openAlertCount: number | null;
  totals: CapabilityTotals | null;
  /** 관찰 기록(MallOperationOutcome) 요약 — 최근 7일 건수 · 몰 수 · 로그인 기록 수. 못 받았으면 `null`. */
  outcomes: { total: number; malls: number; loginRecords: number } | null;
}

/** 못 받은 숫자 자리. 불러오는 중이든 실패했든 지어내지 않는다. */
export const PIPELINE_UNKNOWN = '아직 숫자를 받지 못했습니다.';

export const PIPELINE_ITEM_LABEL: Record<MissionStatus, string> = { done: '됨', progress: '일부', todo: '아직' };
const MISSION_LABEL: Record<MissionStatus, string> = { done: '됨', progress: '진행 중', todo: '아직' };
const STATUS_ORDER: readonly MissionStatus[] = ['done', 'progress', 'todo'];

/** 다 되면 됨, 하나라도 되면 일부, 하나도 없으면 아직. */
export function summarizeStatus(statuses: readonly MissionStatus[]): MissionStatus {
  if (statuses.length === 0 || statuses.every((status) => status === 'todo')) return 'todo';
  return statuses.every((status) => status === 'done') ? 'done' : 'progress';
}

function tally(statuses: readonly MissionStatus[], labels: Record<MissionStatus, string>): string {
  const parts = [`${formatNumber(statuses.length)}개`];
  for (const status of STATUS_ORDER) {
    const count = statuses.filter((value) => value === status).length;
    if (count > 0) parts.push(`${labels[status]} ${formatNumber(count)}`);
  }
  return parts.join(' · ');
}

function stage(
  key: PipelineStageKey,
  name: string,
  question: string,
  items: PipelineItem[],
  note: string | null = null,
): PipelineStage {
  const statuses = items.map((item) => item.status);
  return {
    key,
    name,
    question,
    status: summarizeStatus(statuses),
    tally: tally(statuses, PIPELINE_ITEM_LABEL),
    note,
    items,
  };
}

function amount(value: number | null, unit: string): string {
  return value === null ? PIPELINE_UNKNOWN : `${formatNumber(value)}${unit}`;
}

export function buildAgentPipeline(input: AgentPipelineInput): PipelineStage[] {
  const { missions, alerts, totals } = input;
  const missionStatuses = missions.map((mission) => mission.status);

  // 몰마다 되는 일 — 쇼핑몰 현황과 같은 판정. 불가(빨강) 몰은 할 일이 아니다.
  const capability = (
    key: CapabilityKey,
    id: string,
    title: string,
    href: PipelineItem['href'],
    suffix = '',
  ): PipelineItem => {
    if (!totals) return { id, title, status: 'progress', detail: PIPELINE_UNKNOWN, href };
    const counts = totals[key];
    const malls = counts.ready + counts.pending + counts.unavailable;
    return {
      id,
      title,
      status: counts.pending === 0 ? 'done' : counts.ready > 0 ? 'progress' : 'todo',
      detail: `${formatNumber(malls)}곳 중 ${formatNumber(counts.ready)}곳${suffix}`,
      href,
    };
  };

  return [
    {
      key: 'mission',
      name: '미션',
      question: '무엇을 해내나',
      status: summarizeStatus(missionStatuses),
      tally: tally(missionStatuses, MISSION_LABEL),
      note: null,
      items: [],
    },
    stage('sense', '감지', '무엇을 보고 움직이나', [
      {
        id: 'sense-work',
        title: '주문수집 · 쿠팡 수집 알림',
        status: 'done',
        detail: alerts
          ? `알림 ${formatNumber(alerts.total)}건 · 확인 필요 ${formatNumber(alerts.attention)}건`
          : PIPELINE_UNKNOWN,
        href: { path: '#mall-alerts', label: '알림판' },
      },
      {
        id: 'sense-login',
        title: '로그인 정보 없는 몰',
        status: 'done',
        detail: amount(input.noLoginCount, '곳'),
        href: { path: '/mall-settings', label: '계정 설정' },
      },
      {
        // 확장이 조용히 읽고, 모르면 화면을 열어 봐 몰마다 셋 중 하나로 답한다.
        id: 'sense-session',
        title: '몰 로그인 상태',
        status: 'progress',
        detail: input.sessions
          ? `로그인됨 ${formatNumber(input.sessions.signedIn)} · 인증 필요 ${formatNumber(input.sessions.verification)} · 로그인 필요 ${formatNumber(input.sessions.signedOut)}곳`
          : PIPELINE_UNKNOWN,
        href: { path: '#mall-status', label: '몰별 상태' },
      },
      {
        id: 'sense-soldout',
        title: '품절 후보',
        status: 'done',
        detail:
          input.soldOutTotal === null
            ? PIPELINE_UNKNOWN
            : `${formatNumber(input.soldOutTotal)}개 — 판매 가능 재고 0`,
        href: { path: '/mall-availability', label: '품절 관리' },
      },
      {
        id: 'sense-coupang',
        title: '쿠팡 발주확인 대기',
        status: 'done',
        detail: amount(input.coupangPendingAccept, '건'),
        href: { path: '/orders', label: '주문 처리' },
      },
      {
        id: 'sense-open-alerts',
        title: '열린 몰 알림',
        status: 'done',
        detail: amount(input.openAlertCount, '건'),
        href: { path: '#mall-alerts', label: '알림판' },
      },
      {
        id: 'sense-form',
        title: '등록 폼 경고',
        status: 'progress',
        detail: '경고 수가 관찰 기록에 남아 몰별 상태에 보인다. 알림으로는 아직 안 뜬다.',
        href: null,
      },
      {
        id: 'sense-tracking',
        title: '송장 전송 결과',
        status: 'todo',
        detail: '송장 전송 결과는 아직 서버에 남지 않는다. 주문 쪽 기록이 생기면 거기서 읽는다.',
        href: null,
      },
      {
        id: 'sense-notice',
        title: '몰 공지 · 알림',
        status: 'todo',
        detail: '몰 공지를 가져오지 않는다 (미션 2).',
        href: null,
      },
      {
        id: 'sense-claim',
        title: '클레임 · 문의',
        status: 'todo',
        detail: '가져오는 몰이 없다 (미션 7).',
        href: null,
      },
    ]),
    stage(
      'decide',
      '판단',
      '무엇을 할지 고르나',
      [
        {
          id: 'decide-priority',
          title: '먼저 볼 알림 고르기',
          status: 'todo',
          detail: '지금은 사람이 알림판을 보고 고른다.',
          href: null,
        },
        {
          id: 'decide-rerun',
          title: '멈춘 수집 다시 돌릴지 정하기',
          status: 'todo',
          detail: '멈춘 이유(로그인 · 캡차)는 적히지만 다시 돌릴지는 사람이 정한다.',
          href: null,
        },
        {
          id: 'decide-form',
          title: '바뀐 등록 폼 다시 읽고 칸 지도 고치기',
          status: 'todo',
          detail: '폼이 바뀌면 사람이 다시 실측한다 (미션 1).',
          href: null,
        },
        {
          id: 'decide-reject',
          title: '등록 반려 사유 읽고 고칠 곳 찾기',
          status: 'todo',
          detail: '반려되면 사람이 몰 화면을 보고 고친다.',
          href: null,
        },
        {
          id: 'decide-notice',
          title: '몰 공지가 우리에게 영향 있는지 가리기',
          status: 'todo',
          detail: '몰 공지를 아직 못 본다 (미션 2).',
          href: null,
        },
        {
          id: 'decide-handoff',
          title: '고른 일을 사람 승인으로 넘기기',
          status: 'todo',
          detail: '판단이 생기면 제안을 사람 승인으로 넘긴다.',
          href: null,
        },
      ],
      'AI 판단은 Agent OS 에서 돈다. 쇼핑몰 에이전트는 아직 연결 전이다.',
    ),
    stage('act', '도구', '실제로 무엇을 하나', [
      capability('orders', 'act-orders', '주문수집', { path: '/order-collection', label: '주문수집' }),
      capability('tracking', 'act-tracking', '송장 전송', { path: '/order-collection', label: '주문수집' }),
      capability(
        'register',
        'act-register',
        '상품등록 폼 채우기',
        { path: '/mall-listings', label: '상품 등록' },
        ' · 제출은 사람이',
      ),
      capability('soldout', 'act-soldout', '품절 · 해제 송신', { path: '/mall-availability', label: '품절 관리' }),
      {
        id: 'act-login',
        title: '자동 로그인',
        status: 'progress',
        detail: '저장된 계정으로 로그인한다. 캡차 · OTP 몰은 사람을 부른다.',
        href: { path: '/mall-settings', label: '쇼핑몰 계정' },
      },
      {
        id: 'act-tidy',
        title: '알림 닫기',
        status: 'done',
        detail: '실패 알림은 원천이 다시 성공하면 저절로 닫힌다. 본 알림은 알림판에서 닫는다.',
        href: { path: '#mall-alerts', label: '알림판' },
      },
    ]),
    stage('approve', '사람 승인', '되돌리기 어려운 일은 누가 누르나', [
      {
        id: 'approve-submit',
        title: '상품등록 최종 제출',
        status: 'done',
        detail: '확장은 폼을 채우기만 한다. 저장 · 등록은 사람이 누른다.',
        href: { path: '/mall-listings', label: '상품 등록' },
      },
      {
        id: 'approve-destructive',
        title: '삭제 · 완전품절',
        status: 'done',
        detail: '몰 규칙이 허용할 때만, 사람이 누른다.',
        href: null,
      },
      {
        id: 'approve-login',
        title: '몰 계정 비밀번호',
        status: 'done',
        detail: '사람이 계정 설정에서 직접 넣는다. 코드 · 기록에 남기지 않는다.',
        href: { path: '/mall-settings', label: '쇼핑몰 계정' },
      },
      {
        id: 'approve-tidy',
        title: '멈춘 수집 정리',
        status: 'done',
        detail: '확인 창에서 사람이 눌러야 닫힌다.',
        href: { path: '#mall-alerts', label: '알림판' },
      },
      {
        id: 'approve-inbox',
        title: '에이전트 제안 승인함',
        status: 'todo',
        detail: '판단이 생기면 에이전트 제안을 여기서 승인한다.',
        href: null,
      },
    ]),
    stage('remember', '기억', '해 본 일을 쌓아 배우나', [
      {
        id: 'remember-values',
        title: '사람이 고른 몰 등록 값',
        status: 'done',
        detail: '상품마다 저장해 다음 등록에 다시 쓴다.',
        href: { path: '/mall-listings', label: '상품 등록' },
      },
      {
        id: 'remember-alerts',
        title: '몰 작업 알림 기록',
        status: 'progress',
        detail: '서버 알림으로 남지만, 배울 수 있게 몰별로 모으지 않는다.',
        href: null,
      },
      {
        id: 'remember-results',
        title: '관찰 기록 (로그인 확인 · 로그인 테스트 · 등록 폼)',
        status: 'done',
        detail: input.outcomes
          ? `최근 7일 ${formatNumber(input.outcomes.total)}건 · 몰 ${formatNumber(input.outcomes.malls)}곳`
          : PIPELINE_UNKNOWN,
        href: null,
      },
      {
        id: 'remember-fixes',
        title: '사람이 고친 칸',
        status: 'todo',
        detail: '채움 결과에서 사람이 고친 값을 모으지 않는다.',
        href: null,
      },
      {
        id: 'remember-forms',
        title: '등록 폼이 바뀐 기록',
        status: 'todo',
        detail: '칸 지도가 언제 어떻게 바뀌었는지 남기지 않는다.',
        href: null,
      },
      {
        id: 'remember-login',
        title: '로그인 성공 · 실패',
        status: 'done',
        detail: input.outcomes
          ? `최근 7일 로그인 기록 ${formatNumber(input.outcomes.loginRecords)}건`
          : PIPELINE_UNKNOWN,
        href: { path: '/mall-settings', label: '로그인 테스트' },
      },
    ]),
  ];
}
