import type {
  AgentDefinitionRecord,
  AgentDefinitionToolPolicyRecord,
} from './agent-os.types';

const PROMPT_BASE = 'agent-config/prompts/agents';

type AgentDefinitionSeed = Omit<
  AgentDefinitionRecord,
  'id' | 'catalogStatus' | 'marketplaceId' | 'defaultToolPolicies'
> & {
  catalogStatus?: string;
  marketplaceId?: string | null;
  defaultToolPolicies?: AgentDefinitionToolPolicyRecord[];
};

const DEFINITIONS: readonly AgentDefinitionSeed[] = [
  {
    type: 'manager',
    name: 'Manager Agent',
    description: '전사 데이터 분석/지시 에이전트',
    promptPath: `${PROMPT_BASE}/manager.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_MANAGER_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'coordinator',
  },
  {
    type: 'rules_evaluation',
    name: 'Rules Evaluation',
    description: '룰 평가 tool-wrapper. 비즈니스 규칙 평가는 고정 작업으로 분리 대상.',
    promptPath: `${PROMPT_BASE}/rules-evaluation.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_RULES_EVALUATION_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'rules_suggest',
    name: 'Rules Threshold Suggester',
    description: '룰 임계 제안 tool-wrapper. 데이터 분포 기반 고정 AI 작업.',
    promptPath: `${PROMPT_BASE}/rules-suggest.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_RULES_SUGGEST_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'ad_strategy',
    name: 'Ad Strategy',
    description: '광고 전략 분석 tool-wrapper. 동적 planning loop 도입 전까지 고정 AI 작업.',
    promptPath: `${PROMPT_BASE}/ad-strategy.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_AD_STRATEGY_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'sourcing',
    name: 'Sourcing',
    description: '소싱 URL 스크래핑/상품 수집 tool-wrapper.',
    promptPath: `${PROMPT_BASE}/sourcing.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_SOURCING_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'thumbnail_analyst',
    name: 'Thumbnail Analyst',
    description: '썸네일 컴플라이언스 분석 tool-wrapper.',
    promptPath: `${PROMPT_BASE}/thumbnail-analyst.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_THUMBNAIL_ANALYST_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'image_edit',
    name: 'Image Edit',
    description: '이미지 편집 tool-wrapper.',
    promptPath: `${PROMPT_BASE}/manager.md`,
    defaultAdapterType: 'gemini_image',
    defaultModelEnv: 'AGENT_IMAGE_EDIT_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'thumbnail_auto_edit',
    name: 'Thumbnail Auto Edit',
    description: 'A 등급 cohort 자동 재편집 operation wrapper.',
    promptPath: `${PROMPT_BASE}/thumbnail-analyst.md`,
    defaultAdapterType: 'python_http',
    defaultModelEnv: 'AGENT_THUMBNAIL_AUTO_EDIT_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'detail_page_generate',
    name: 'Detail Page Generate',
    description:
      '상세페이지 1-call 생성 tool-wrapper. 출력은 ai 도메인 detail-page-generate output schema 가 검증한다.',
    promptPath: `${PROMPT_BASE}/detail-page-generate.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_DETAIL_PAGE_GENERATE_MODEL',
    defaultRuntimeConfig: {
      outputContract: 'ai.detail_page_generate.v1',
    },
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'thumbnail_generate',
    name: 'Thumbnail Generate',
    description:
      '썸네일 에디터/배치 1-call 생성 tool-wrapper. 출력은 ai 도메인 thumbnail-generate output schema 가 검증한다.',
    promptPath: `${PROMPT_BASE}/thumbnail-generate.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_THUMBNAIL_GENERATE_MODEL',
    defaultRuntimeConfig: {
      outputContract: 'ai.thumbnail_generate.v1',
    },
    defaultCapabilities: {},
    runtimeKind: 'tool_wrapper',
  },
  {
    type: 'chat',
    name: 'Chatbot',
    description: 'Operator chatbot — read-only backend-provided context.',
    promptPath: `${PROMPT_BASE}/chat.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_CHAT_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'agent',
  },
] as const;

export function listAgentDefinitions(): AgentDefinitionRecord[] {
  return DEFINITIONS.map(toRecord);
}

export function findAgentDefinitionByType(
  type: string,
): AgentDefinitionRecord | null {
  const found = DEFINITIONS.find((definition) => definition.type === type);
  return found ? toRecord(found) : null;
}

export function resolveDefinitionDefaultModel(
  definition: Pick<AgentDefinitionRecord, 'defaultModelEnv'>,
): string | null {
  const specific = process.env[definition.defaultModelEnv];
  if (specific && specific.length > 0) return specific;
  const shared = process.env.AGENT_DEFAULT_MODEL;
  return shared && shared.length > 0 ? shared : null;
}

function toRecord(definition: AgentDefinitionSeed): AgentDefinitionRecord {
  return {
    ...definition,
    id: definition.type,
    catalogStatus: definition.catalogStatus ?? 'active',
    marketplaceId: definition.marketplaceId ?? null,
    defaultToolPolicies: definition.defaultToolPolicies ?? [],
  };
}
