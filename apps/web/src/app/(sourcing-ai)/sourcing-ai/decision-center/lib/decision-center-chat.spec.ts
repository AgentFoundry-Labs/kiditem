import { describe, expect, it } from 'vitest';
import {
  buildDecisionChatReply,
  parseCandidateRank,
  parseDecisionChatIntent,
} from './decision-center-chat';
import type {
  SourcingDecisionCandidateViewModel,
  SourcingDecisionCenterViewModel,
} from './sourcing-decision-center';

describe('parseDecisionChatIntent', () => {
  it('발주 요청은 다른 어떤 해석보다 먼저 거부로 잡는다', () => {
    // 이 화면은 구매를 실행하지 않는다. "후보 발주해줘" 가 후보 조회로 새면 안 된다.
    expect(parseDecisionChatIntent('이 후보 발주해줘')).toEqual({ kind: 'purchase-refusal' });
    expect(parseDecisionChatIntent('그냥 주문해')).toEqual({ kind: 'purchase-refusal' });
    expect(parseDecisionChatIntent('테스트 오더 만들어줘')).toEqual({ kind: 'purchase-refusal' });
    expect(parseDecisionChatIntent('PO 생성')).toEqual({ kind: 'purchase-refusal' });
  });

  it('알려진 명령을 각 의도로 매핑한다', () => {
    expect(parseDecisionChatIntent('데이터 소스 상태 확인하기')).toEqual({ kind: 'sources' });
    expect(parseDecisionChatIntent('검증 요청함 확인하기')).toEqual({ kind: 'intents' });
    expect(parseDecisionChatIntent('다음 검증 단계 제안받기')).toEqual({ kind: 'next-step' });
    expect(parseDecisionChatIntent('다른 후보 보기')).toEqual({ kind: 'candidates' });
  });

  it('명시적 분석 접두어가 있는 입력만 분석 키워드로 본다', () => {
    expect(parseDecisionChatIntent('분석: 유아 빨대컵')).toEqual({
      kind: 'run',
      keyword: '유아 빨대컵',
    });
    expect(parseDecisionChatIntent('유아 빨대컵')).toEqual({ kind: 'unsupported' });
    expect(parseDecisionChatIntent('이 후보 마진 괜찮아?')).toEqual({ kind: 'unsupported' });
  });

  it('빈 입력은 의도를 만들지 않는다', () => {
    expect(parseDecisionChatIntent('   ')).toBeNull();
  });

  it('순위 표기를 뽑아 특정 후보를 지목한다', () => {
    expect(parseCandidateRank('#3 자세히')).toBe(3);
    expect(parseCandidateRank('2번 후보 상세')).toBe(2);
    expect(parseCandidateRank('자세히')).toBeNull();
    expect(parseDecisionChatIntent('#3 자세히 보여줘')).toEqual({ kind: 'candidate', rank: 3 });
  });
});

describe('buildDecisionChatReply', () => {
  it('발주를 요청하면 거절하고 대신 가능한 것을 알린다', () => {
    const [turn] = buildDecisionChatReply({
      intent: { kind: 'purchase-refusal' },
      viewModel: viewModelWith([]),
      focusedCandidateId: null,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('발주를 만들 수 없어요');
    expect(turn.text).toContain('샘플');
    expect(turn.card).toBeUndefined();
  });

  it('배치가 없으면 후보를 물어도 배치부터 만들라고 답한다', () => {
    const [turn] = buildDecisionChatReply({
      intent: { kind: 'candidates' },
      viewModel: viewModelWith([], { batchState: 'missing' }),
      focusedCandidateId: null,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('아직 생성된 결정 배치가 없어요');
  });

  it('읽기 전용 계정에는 분석을 실행할 수 없다고 답한다', () => {
    const [turn] = buildDecisionChatReply({
      intent: { kind: 'run', keyword: '자석 블록' },
      viewModel: viewModelWith([]),
      focusedCandidateId: null,
      canManage: false,
      turnSeq: 1,
    });

    expect(turn.text).toContain('읽기 전용');
  });

  it('지원하지 않는 자유 문장은 실행하지 않고 사용 가능한 입력 방식을 안내한다', () => {
    const [turn] = buildDecisionChatReply({
      intent: { kind: 'unsupported' },
      viewModel: viewModelWith([]),
      focusedCandidateId: null,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('실행하지 않았어요');
    expect(turn.card).toBeUndefined();
  });

  it('다음 단계를 물으면 실행 가능 여부를 사유와 함께 답한다', () => {
    const blocked = candidate({
      canRequestRfq: false,
      canRequestSample: false,
      actionBlockReasons: ['supplier_offer_missing'],
    });

    const [turn] = buildDecisionChatReply({
      intent: { kind: 'next-step' },
      viewModel: viewModelWith([blocked]),
      focusedCandidateId: blocked.id,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('연결된 공급자 제안이 없습니다');
    expect(turn.card).toEqual({ kind: 'candidate-detail', candidateId: blocked.id });
  });

  it('샘플까지 가능하면 샘플 가능 사실을 먼저 알린다', () => {
    const ready = candidate({ canRequestRfq: true, canRequestSample: true });

    const [turn] = buildDecisionChatReply({
      intent: { kind: 'next-step' },
      viewModel: viewModelWith([ready]),
      focusedCandidateId: ready.id,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('샘플 요청을 만들 수 있어요');
  });

  it('공급자가 샘플을 막으면 RFQ만 안내하고 샘플 차단 이유를 함께 말한다', () => {
    const readyForRfq = candidate({
      canRequestRfq: true,
      canRequestSample: false,
      offer: { sampleAvailable: false } as SourcingDecisionCandidateViewModel['offer'],
      actionBlockReasons: ['supplier_sample_unavailable'],
    });

    const [turn] = buildDecisionChatReply({
      intent: { kind: 'next-step' },
      viewModel: viewModelWith([readyForRfq]),
      focusedCandidateId: readyForRfq.id,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('견적 요청(RFQ)을 만들 수 있어요');
    expect(turn.text).toContain('공급자가 샘플을 제공하지 않는 제안');
  });

  it('만료된 배치에서는 다음 단계를 만들 수 없다고 답한다', () => {
    const ready = candidate({ canRequestRfq: true });

    const [turn] = buildDecisionChatReply({
      intent: { kind: 'next-step' },
      viewModel: viewModelWith([ready], { batchState: 'expired' }),
      focusedCandidateId: ready.id,
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.text).toContain('다시 분석');
  });

  it('순위로 지목한 후보를 찾아 상세 카드를 붙인다', () => {
    const first = candidate({ id: 'c1', rank: 1 });
    const third = candidate({ id: 'c3', rank: 3 });

    const [turn] = buildDecisionChatReply({
      intent: { kind: 'candidate', rank: 3 },
      viewModel: viewModelWith([first, third]),
      focusedCandidateId: 'c1',
      canManage: true,
      turnSeq: 1,
    });

    expect(turn.card).toEqual({ kind: 'candidate-detail', candidateId: 'c3' });
  });
});

function candidate(
  overrides: Partial<SourcingDecisionCandidateViewModel> = {},
): SourcingDecisionCandidateViewModel {
  return {
    id: 'candidate-1',
    rank: 1,
    productName: '실리콘 빨대컵 200ml',
    decision: 'test_order',
    decisionLabel: '테스트 검증 후보',
    executionEligible: false,
    score: 86,
    confidence: 0.72,
    confidenceKind: 'coverage',
    evidenceFamilyCount: 3,
    evidencePlatformCount: 2,
    hasCoupangEvidence: true,
    has1688Evidence: true,
    nextEvidenceAction: null,
    reasonCodes: [],
    riskCodes: [],
    offer: null,
    launchCandidate: null,
    latestIntent: null,
    canRequestRfq: false,
    canRequestSample: false,
    actionBlockReasons: [],
    ...overrides,
  } as SourcingDecisionCandidateViewModel;
}

function viewModelWith(
  candidates: SourcingDecisionCandidateViewModel[],
  overrides: Partial<SourcingDecisionCenterViewModel> = {},
): SourcingDecisionCenterViewModel {
  return {
    latestBatch: null,
    batchState: 'investigation',
    sourceEntitlements: [],
    candidates,
    summary: {
      sourceEntitlementCount: 0,
      decisionEligibleEntitlementCount: 0,
      blockedEntitlementCount: 0,
      launchCandidateCount: 0,
      decisionCandidateCount: candidates.length,
      holdCount: 0,
      rejectCount: 0,
      testOrderCount: candidates.length,
      proposedIntentCount: 0,
    },
    ...overrides,
  } as SourcingDecisionCenterViewModel;
}
