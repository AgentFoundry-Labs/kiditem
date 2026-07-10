export type AgentUnitOperationalRole = 'employee' | 'capability';

export interface AgentUnitTaxonomy {
  type: string;
  role: AgentUnitOperationalRole;
  displayName: string;
  responsibility: string;
  ownerAgentType: string | null;
}

const AGENT_UNIT_TAXONOMY: Record<
  string,
  Omit<AgentUnitTaxonomy, 'type'>
> = {
  manager: {
    role: 'employee',
    displayName: '운영 총괄',
    responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
    ownerAgentType: null,
  },
  sourcing: {
    role: 'employee',
    displayName: '소싱 담당',
    responsibility: '상품 후보와 공급처 신호를 수집하고 기회를 선별한다.',
    ownerAgentType: null,
  },
  listing: {
    role: 'employee',
    displayName: '상품 등록 담당',
    responsibility: '상세페이지, 썸네일, 마켓 등록 초안 패키지를 만든다.',
    ownerAgentType: null,
  },
  order: {
    role: 'employee',
    displayName: '발주 담당',
    responsibility: '승인된 상품의 발주 초안과 공급 실행 단계를 관리한다.',
    ownerAgentType: null,
  },
  channel_registration: {
    role: 'employee',
    displayName: '채널 등록 담당',
    responsibility: '마켓별 상품 등록 상태와 외부 채널 식별자를 관리한다.',
    ownerAgentType: null,
  },
  ad_strategy: {
    role: 'employee',
    displayName: '광고 전략 담당',
    responsibility: '광고 성과 신호를 분석하고 조정안을 제안한다.',
    ownerAgentType: null,
  },
  chat: {
    role: 'employee',
    displayName: '고객/운영 응대 담당',
    responsibility: '운영자가 묻는 내용을 맥락화하고 대화형 응답을 제공한다.',
    ownerAgentType: null,
  },
  rules_evaluation: {
    role: 'capability',
    displayName: '룰 평가 능력',
    responsibility: '운영 룰을 데이터에 적용해 통과/보류 판단을 만든다.',
    ownerAgentType: 'manager',
  },
  rules_suggest: {
    role: 'capability',
    displayName: '임계값 제안 능력',
    responsibility: '성과 분포를 바탕으로 운영 룰 임계값 후보를 제안한다.',
    ownerAgentType: 'manager',
  },
  thumbnail_analyst: {
    role: 'capability',
    displayName: '썸네일 분석 능력',
    responsibility: '썸네일 품질과 컴플라이언스 리스크를 분석한다.',
    ownerAgentType: 'listing',
  },
} as const;

const OPERATIONAL_ROLES = new Set<AgentUnitOperationalRole>([
  'employee',
  'capability',
]);

export function normalizeAgentUnitOperationalRole(
  role: string | null | undefined,
): AgentUnitOperationalRole | null {
  return OPERATIONAL_ROLES.has(role as AgentUnitOperationalRole)
    ? (role as AgentUnitOperationalRole)
    : null;
}

export function getAgentUnitTaxonomy(type: string): AgentUnitTaxonomy | null {
  const found = AGENT_UNIT_TAXONOMY[type];
  if (!found) return null;

  return {
    type,
    ...found,
  };
}

export function resolveAgentUnitTaxonomy(input: {
  type: string;
  name: string;
  role: string | null;
  title: string | null;
}): AgentUnitTaxonomy {
  const definition = getAgentUnitTaxonomy(input.type);
  const role =
    normalizeAgentUnitOperationalRole(input.role) ??
    definition?.role ??
    'capability';
  const displayName = input.title ?? definition?.displayName ?? input.name;
  const responsibility =
    definition?.responsibility ??
    (role === 'employee'
      ? `${displayName} 업무를 수행한다.`
      : `${displayName} 기능은 담당 직원에게 귀속되지 않은 상태다.`);

  return {
    type: input.type,
    role,
    displayName,
    responsibility,
    ownerAgentType: definition?.ownerAgentType ?? null,
  };
}
