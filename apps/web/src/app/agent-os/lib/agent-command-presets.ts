import type { AgentOfficeNode } from './agent-office-model';

export interface AgentCommandTarget {
  id: string;
  agentType: string;
  displayName: string;
}

const PRESETS: Record<string, readonly string[]> = {
  manager: [
    '승인 대기 업무를 우선순위로 정리해줘',
    '오늘 운영 병목과 담당자를 정리해줘',
    '진행 중인 업무의 위험 요소를 요약해줘',
  ],
  sourcing: [
    '신규 상품 후보와 공급처 리스크를 정리해줘',
    '소싱 후보의 가격과 MOQ를 비교해줘',
    '발주 검토가 필요한 후보를 추려줘',
  ],
  listing: [
    '상품 등록 초안을 작성해줘',
    '상세페이지와 썸네일 준비 상태를 점검해줘',
    '등록 누락 필드를 정리해줘',
  ],
  order: [
    '승인된 상품의 발주 초안을 정리해줘',
    '발주 지연 위험을 확인해줘',
    '공급처별 발주 현황을 요약해줘',
  ],
  channel_registration: [
    '채널별 등록 대기 상품을 정리해줘',
    '마켓 등록 실패 원인을 요약해줘',
    '외부 채널 동기화 상태를 점검해줘',
  ],
  ad_strategy: [
    '광고 성과가 낮은 상품을 정리해줘',
    '예산 재배분 후보를 제안해줘',
    '캠페인별 위험 신호를 요약해줘',
  ],
  chat: [
    '고객 문의의 주요 이슈를 분류해줘',
    '반복 문의에 필요한 답변 초안을 작성해줘',
    '긴급 응대가 필요한 대화를 추려줘',
  ],
};

export function getAgentCommandPresets(
  agentType: string | null,
): readonly string[] {
  return PRESETS[agentType ?? 'manager'] ?? PRESETS.manager;
}

export function commandTargetFromNode(
  node: AgentOfficeNode | null,
): AgentCommandTarget | null {
  if (!node) return null;

  return {
    id: node.id,
    agentType: node.agentType,
    displayName: node.displayName,
  };
}

export function buildOperatorCommand(input: {
  content: string;
  target: AgentCommandTarget | null;
}): string {
  const content = input.content.trim();
  if (!content) return '';
  if (!input.target || input.target.agentType === 'manager') return content;

  return [
    '[Agent OS 업무 배정 요청]',
    `대상 직원: ${input.target.displayName}`,
    `대상 직원 유형: ${input.target.agentType}`,
    `대상 직원 ID: ${input.target.id}`,
    `업무: ${content}`,
  ].join('\n');
}
