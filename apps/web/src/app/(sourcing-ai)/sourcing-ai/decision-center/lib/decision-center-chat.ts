import { resolveCandidateActionAvailability } from './decision-center-presenter';
import type {
  DecisionBatchState,
  SourcingDecisionCandidateViewModel,
  SourcingDecisionCenterViewModel,
} from './sourcing-decision-center';

/**
 * 의사결정 센터의 대화 모델. 결정론적이다 — LLM 을 태우지 않고 키워드 매칭으로만
 * 의도를 고르고, 응답은 현재 read model 로부터 만든다.
 *
 * 카드는 데이터를 복사해 담지 않고 후보 id 만 들고 있다. 렌더 시점에 최신 view model
 * 에서 다시 찾으므로, 배치가 갱신되면 지나간 말풍선의 숫자도 같이 최신화된다.
 */
export type DecisionChatIntent =
  | { kind: 'run'; keyword: string }
  | { kind: 'candidates' }
  | { kind: 'candidate'; rank: number | null }
  | { kind: 'next-step' }
  | { kind: 'intents' }
  | { kind: 'sources' }
  | { kind: 'unsupported' }
  | { kind: 'purchase-refusal' };

export type DecisionChatCard =
  | { kind: 'batch' }
  | { kind: 'candidate'; candidateId: string }
  /** 근거 + 실행 버튼까지 붙는 확장형. 검증 요청은 여기서만 만들 수 있다. */
  | { kind: 'candidate-detail'; candidateId: string }
  | { kind: 'candidate-list' }
  | { kind: 'sources' }
  | { kind: 'intents' };

export interface DecisionChatTurn {
  id: string;
  role: 'agent' | 'user';
  text: string;
  /** 사용자 말풍선 아래 붙는 보조 칩. 예: `카테고리: 유아 식기/컵` */
  chip?: string;
  card?: DecisionChatCard;
  /** 카드 뒤에 이어붙는 유도 문장. */
  followUp?: string;
}

export const DECISION_QUICK_ACTIONS = [
  '다른 후보 보기',
  '다음 검증 단계 제안받기',
  '검증 요청함 확인하기',
  '데이터 소스 상태 확인하기',
] as const;

const PURCHASE_WORDS = [
  '발주해',
  '주문해',
  '구매해',
  '구입해',
  '발주하',
  '주문하',
  '결제',
  '테스트오더',
  'po생성',
  'po만들',
  '발주서',
];
const SOURCE_WORDS = ['소스', '권한', '데이터소스', '엔타이틀'];
const INTENT_WORDS = ['요청함', '요청내역', 'intent', '인텐트', '요청확인'];
const NEXT_STEP_WORDS = ['다음검증', '다음단계', '제안받', '뭘해야', '무엇을해야'];
const CANDIDATE_LIST_WORDS = ['다른후보', '후보보기', '후보목록', '후보전체', '전체후보'];
const CANDIDATE_DETAIL_WORDS = ['자세히', '상세', '위험요인', '리스크', '근거', '왜'];

function squash(message: string): string {
  return message.replace(/\s+/g, '').toLowerCase();
}

/** `#3`, `3번`, `3위` 같은 표기에서 배치 내 순위를 뽑는다. */
export function parseCandidateRank(message: string): number | null {
  const matched = message.match(/#\s*(\d{1,3})|(\d{1,3})\s*[번위]/);
  if (!matched) return null;
  const rank = Number(matched[1] ?? matched[2]);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

export function parseDecisionChatIntent(message: string): DecisionChatIntent | null {
  const raw = message.trim();
  if (!raw) return null;
  const text = squash(raw);

  // 발주 요청은 가장 먼저 걸러낸다. 이 화면은 구매를 실행하지 않는다.
  if (PURCHASE_WORDS.some((word) => text.includes(word))) {
    return { kind: 'purchase-refusal' };
  }
  if (SOURCE_WORDS.some((word) => text.includes(word))) return { kind: 'sources' };
  if (INTENT_WORDS.some((word) => text.includes(word))) return { kind: 'intents' };
  if (NEXT_STEP_WORDS.some((word) => text.includes(word))) return { kind: 'next-step' };
  if (CANDIDATE_LIST_WORDS.some((word) => text.includes(word))) return { kind: 'candidates' };
  if (CANDIDATE_DETAIL_WORDS.some((word) => text.includes(word))) {
    return { kind: 'candidate', rank: parseCandidateRank(raw) };
  }

  // 자유 문장을 새 배치 생성으로 오인하지 않도록 명시적 접두어만 분석으로 받는다.
  const analysis = raw.match(/^(?:분석|키워드\s*분석)\s*[:：]\s*(.+)$/i);
  if (analysis?.[1]?.trim()) {
    return { kind: 'run', keyword: analysis[1].trim() };
  }
  return { kind: 'unsupported' };
}

const BATCH_STATE_TEXT: Record<DecisionBatchState, string> = {
  missing: '아직 생성된 결정 배치가 없어요. 분석할 키워드를 입력해 주세요.',
  investigation: '분석을 완료했어요. 후보 배치 1개를 찾았어요.',
  expired: '가장 최근 배치는 만료됐어요. 만료된 배치로는 검증 요청을 만들 수 없어요. 키워드를 다시 분석해 주세요.',
  inactive: '가장 최근 배치가 비활성 상태예요. 검증 요청을 만들려면 다시 분석해야 해요.',
};

export function greetingTurns(): DecisionChatTurn[] {
  return [
    {
      id: 'greeting',
      role: 'agent',
      text: '최근 30일 저장 증거를 재생하는 결정 도우미입니다.\n새 분석은 아래 키워드 입력란에서 실행하고, 저장된 결과는 바로가기 명령으로 탐색할 수 있어요.',
    },
  ];
}

/** 사용자 입력 하나에 대한 에이전트 응답 턴들. */
export function buildDecisionChatReply(input: {
  intent: DecisionChatIntent;
  viewModel: SourcingDecisionCenterViewModel;
  /** 상세를 물었을 때 기준이 되는 후보. 보통 현재 선택된 후보. */
  focusedCandidateId: string | null;
  canManage: boolean;
  turnSeq: number;
}): DecisionChatTurn[] {
  const { intent, viewModel, canManage, turnSeq } = input;
  const id = (suffix: string) => `agent:${turnSeq}:${suffix}`;
  const candidates = viewModel.candidates;
  const focused = resolveFocusedCandidate(candidates, input.focusedCandidateId);

  if (intent.kind === 'purchase-refusal') {
    return [
      {
        id: id('refusal'),
        role: 'agent',
        text: '이 화면에서는 발주를 만들 수 없어요. 자동 테스트 발주와 발주서 생성은 잠겨 있습니다.\n대신 견적 요청(RFQ)이나 샘플 요청까지는 제가 만들어 드릴 수 있어요.',
      },
    ];
  }

  if (intent.kind === 'sources') {
    const { sourceEntitlementCount, decisionEligibleEntitlementCount, blockedEntitlementCount } =
      viewModel.summary;
    return [
      {
        id: id('sources'),
        role: 'agent',
        text:
          sourceEntitlementCount === 0
            ? '등록된 소스 권한이 없어요. 권한이 없으면 어떤 증거도 결정에 쓰이지 않습니다.'
            : `소스 ${sourceEntitlementCount}개 중 ${decisionEligibleEntitlementCount}개를 결정에 쓸 수 있어요.${blockedEntitlementCount > 0 ? ` ${blockedEntitlementCount}개는 차단돼 있어요.` : ''}`,
        card: { kind: 'sources' },
      },
    ];
  }

  if (intent.kind === 'intents') {
    const total = viewModel.summary.proposedIntentCount;
    return [
      {
        id: id('intents'),
        role: 'agent',
        text:
          total === 0
            ? '아직 만들어진 검증 요청이 없어요.'
            : `검토 대기 중인 검증 요청이 ${total}건 있어요.`,
        card: { kind: 'intents' },
      },
    ];
  }

  if (intent.kind === 'run') {
    // 실행 자체는 호출부가 처리한다. 여기서는 접수 문구만 만든다.
    return [
      {
        id: id('run'),
        role: 'agent',
        text: canManage
          ? `"${intent.keyword}"로 최근 30일 저장 증거를 다시 재생할게요. 새로 수집하지는 않아요.`
          : '현재 계정은 읽기 전용이라 분석을 실행할 수 없어요. Owner 또는 Admin 권한이 필요합니다.',
      },
    ];
  }

  if (intent.kind === 'unsupported') {
    return [
      {
        id: id('unsupported'),
        role: 'agent',
        text: '이 입력은 실행하지 않았어요. 새 분석은 “새 분석 키워드” 입력란을 사용하고, 저장 결과는 아래 바로가기에서 선택해 주세요.',
      },
    ];
  }

  if (viewModel.batchState === 'missing') {
    return [{ id: id('no-batch'), role: 'agent', text: BATCH_STATE_TEXT.missing }];
  }

  if (intent.kind === 'next-step') {
    if (!focused) {
      return [
        {
          id: id('next-step-empty'),
          role: 'agent',
          text: '먼저 후보를 하나 골라 주세요. 후보를 정하면 다음에 뭘 확인해야 하는지 알려드릴게요.',
          card: { kind: 'candidate-list' },
        },
      ];
    }
    return [
      {
        id: id('next-step'),
        role: 'agent',
        text: nextStepText(focused, viewModel.batchState, canManage),
        card: { kind: 'candidate-detail', candidateId: focused.id },
      },
    ];
  }

  if (intent.kind === 'candidate') {
    const target =
      intent.rank != null
        ? candidates.find((candidate) => candidate.rank === intent.rank) ?? focused
        : focused;
    if (!target) {
      return [
        {
          id: id('candidate-missing'),
          role: 'agent',
          text: '해당 후보를 찾지 못했어요. 아래에서 후보를 골라 주세요.',
          card: { kind: 'candidate-list' },
        },
      ];
    }
    return [
      {
        id: id('candidate'),
        role: 'agent',
        text: `#${target.rank} ${target.productName} 의 판단 근거예요.`,
        card: { kind: 'candidate-detail', candidateId: target.id },
      },
    ];
  }

  // intent.kind === 'candidates'
  return [
    {
      id: id('candidates'),
      role: 'agent',
      text: candidateSummaryText(viewModel),
      card: { kind: 'candidate-list' },
    },
  ];
}

/** 분석이 끝난 뒤 배치 결과를 알리는 턴. */
export function batchResultTurns(input: {
  viewModel: SourcingDecisionCenterViewModel;
  turnSeq: number;
}): DecisionChatTurn[] {
  const { viewModel, turnSeq } = input;
  const top = viewModel.candidates[0] ?? null;
  const turns: DecisionChatTurn[] = [
    {
      id: `agent:${turnSeq}:batch`,
      role: 'agent',
      text: BATCH_STATE_TEXT[viewModel.batchState],
      card: viewModel.batchState === 'missing' ? undefined : { kind: 'batch' },
    },
  ];
  if (top) {
    turns.push({
      id: `agent:${turnSeq}:batch-top`,
      role: 'agent',
      text: `우선 #${top.rank} 후보의 판단 근거를 열었습니다.`,
      card: { kind: 'candidate-detail', candidateId: top.id },
    });
  }
  return turns;
}

function resolveFocusedCandidate(
  candidates: SourcingDecisionCandidateViewModel[],
  focusedCandidateId: string | null,
): SourcingDecisionCandidateViewModel | null {
  if (focusedCandidateId) {
    const matched = candidates.find((candidate) => candidate.id === focusedCandidateId);
    if (matched) return matched;
  }
  return candidates[0] ?? null;
}

function candidateSummaryText(viewModel: SourcingDecisionCenterViewModel): string {
  const { decisionCandidateCount, testOrderCount, holdCount, rejectCount } = viewModel.summary;
  if (decisionCandidateCount === 0) return '이 배치에는 판단된 후보가 없어요.';
  return `후보 ${decisionCandidateCount}개예요. 테스트 검증 후보 ${testOrderCount} · 보류 ${holdCount} · 제외 ${rejectCount}.`;
}

function nextStepText(
  candidate: SourcingDecisionCandidateViewModel,
  batchState: DecisionBatchState,
  canManage: boolean,
): string {
  if (!canManage) {
    return '현재 계정은 읽기 전용이라 검증 요청을 만들 수 없어요. Owner 또는 Admin 권한이 필요합니다.';
  }
  if (batchState !== 'investigation') {
    return '이 배치로는 검증 요청을 만들 수 없어요. 키워드를 다시 분석해 주세요.';
  }
  const actions = resolveCandidateActionAvailability(candidate, canManage);
  if (actions.sample.enabled) {
    return '정확한 옵션까지 확정돼 있어 샘플 요청을 만들 수 있어요. 견적 요청도 가능합니다.';
  }
  if (actions.rfq.enabled) {
    return `견적 요청(RFQ)을 만들 수 있어요. 샘플 요청은 아직 잠겨 있습니다. ${actions.sample.reason}`;
  }
  return `이 후보로는 아직 요청을 만들 수 없어요. ${actions.rfq.reason}`;
}
