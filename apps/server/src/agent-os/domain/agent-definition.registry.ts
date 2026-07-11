import type {
  AgentDefinitionRecord,
  AgentDefinitionToolPolicyRecord,
  AgentModelPlan,
  AgentModelPlanRole,
} from './agent-os.types';

const PROMPT_BASE = 'agent-config/prompts/agents';

type AgentDefinitionSeed = Omit<
  AgentDefinitionRecord,
  | 'id'
  | 'catalogStatus'
  | 'marketplaceId'
  | 'defaultAuxiliaryModelEnvs'
  | 'defaultToolPolicies'
  | 'defaultSkillKeys'
  | 'delegationRole'
> & {
  catalogStatus?: string;
  marketplaceId?: string | null;
  defaultAuxiliaryModelEnvs?: AgentDefinitionRecord['defaultAuxiliaryModelEnvs'];
  defaultToolPolicies?: AgentDefinitionToolPolicyRecord[];
  defaultSkillKeys?: AgentDefinitionRecord['defaultSkillKeys'];
  delegationRole?: AgentDefinitionRecord['delegationRole'];
};

const SOURCING_DISCOVERY_TOOL_POLICIES: AgentDefinitionToolPolicyRecord[] = [
  {
    toolKey: 'market.collect_keyword_category_rankings',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'coupang.match_products',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'coupang.collect_tracking_snapshot',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'supplier1688.match_products',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'sourcing.score_opportunities',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'sourcing.create_recommendation_packet',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'sourcing.scrapeProductUrl',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
];

const LISTING_TOOL_POLICIES: AgentDefinitionToolPolicyRecord[] = [
  {
    toolKey: 'product_listing.create_generation_package',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'product_listing.submit_wing_thumbnail',
    effect: 'approval_required',
    approvalMode: 'admin',
    dryRunMode: 'disabled',
    constraints: {},
  },
];

const ORDER_TOOL_POLICIES: AgentDefinitionToolPolicyRecord[] = [
  {
    toolKey: 'supply.create_purchase_order_draft',
    effect: 'allow',
    approvalMode: 'none',
    dryRunMode: 'optional',
    constraints: {},
  },
  {
    toolKey: 'supply.submit_purchase_order',
    effect: 'approval_required',
    approvalMode: 'admin',
    dryRunMode: 'disabled',
    constraints: {},
  },
];

const CHANNEL_REGISTRATION_TOOL_POLICIES: AgentDefinitionToolPolicyRecord[] = [
  {
    toolKey: 'channels.register_confirmed_listing',
    effect: 'approval_required',
    approvalMode: 'admin',
    dryRunMode: 'disabled',
    constraints: {},
  },
  {
    toolKey: 'channels.submit_coupang_listing',
    effect: 'approval_required',
    approvalMode: 'admin',
    dryRunMode: 'disabled',
    constraints: {},
  },
];

const MANAGER_TOOL_POLICIES: AgentDefinitionToolPolicyRecord[] = [];

const DEFINITIONS: readonly AgentDefinitionSeed[] = [
  {
    type: 'manager',
    name: 'Operator',
    description:
      'User-facing coordinator agent for Agent OS conversations and cross-domain delegation.',
    promptPath: `${PROMPT_BASE}/manager.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_MANAGER_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'coordinator',
    delegationRole: 'orchestrator',
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '운영 총괄',
    officeResponsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
    officeOwnerAgentType: null,
    officeOrder: 100,
    defaultToolPolicies: MANAGER_TOOL_POLICIES,
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
    defaultInstanceRole: 'capability',
    defaultInstanceTitle: '룰 평가 능력',
    officeResponsibility: '운영 룰을 데이터에 적용해 통과/보류 판단을 만든다.',
    officeOwnerAgentType: 'manager',
    officeOrder: 110,
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
    defaultInstanceRole: 'capability',
    defaultInstanceTitle: '임계값 제안 능력',
    officeResponsibility: '성과 분포를 바탕으로 운영 룰 임계값 후보를 제안한다.',
    officeOwnerAgentType: 'manager',
    officeOrder: 120,
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
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '광고 전략 담당',
    officeResponsibility: '광고 성과 신호를 분석하고 조정안을 제안한다.',
    officeOwnerAgentType: null,
    officeOrder: 200,
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
    defaultSkillKeys: ['sourcing.magic_scraper'],
    runtimeKind: 'tool_wrapper',
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '소싱 담당',
    officeResponsibility: '상품 후보와 공급처 신호를 수집하고 기회를 선별한다.',
    officeOwnerAgentType: null,
    officeOrder: 400,
    defaultToolPolicies: SOURCING_DISCOVERY_TOOL_POLICIES,
  },
  {
    type: 'listing',
    name: 'Listing Agent',
    description:
      'Prepares marketplace listing draft packages, detail-page drafts, and thumbnail draft jobs from sourced candidates.',
    promptPath: `${PROMPT_BASE}/listing.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_LISTING_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'agent',
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '상품 등록 담당',
    officeResponsibility: '상세페이지, 썸네일, 마켓 등록 초안 패키지를 만든다.',
    officeOwnerAgentType: null,
    officeOrder: 500,
    defaultToolPolicies: LISTING_TOOL_POLICIES,
  },
  {
    type: 'order',
    name: 'Order Agent',
    description:
      'Creates purchase order drafts from approved sourcing recommendations.',
    promptPath: `${PROMPT_BASE}/order.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_ORDER_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'agent',
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '발주 담당',
    officeResponsibility: '승인된 상품의 발주 초안과 공급 실행 단계를 관리한다.',
    officeOwnerAgentType: null,
    officeOrder: 600,
    defaultToolPolicies: ORDER_TOOL_POLICIES,
  },
  {
    type: 'channel_registration',
    name: 'Channel Registration Agent',
    description:
      'Registers externally confirmed marketplace listing identities into KidItem ChannelListing records.',
    promptPath: `${PROMPT_BASE}/channel-registration.md`,
    defaultAdapterType: 'claude_local',
    defaultModelEnv: 'AGENT_CHANNEL_REGISTRATION_MODEL',
    defaultRuntimeConfig: {},
    defaultCapabilities: {},
    runtimeKind: 'agent',
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '채널 등록 담당',
    officeResponsibility: '마켓별 상품 등록 상태와 외부 채널 식별자를 관리한다.',
    officeOwnerAgentType: null,
    officeOrder: 700,
    defaultToolPolicies: CHANNEL_REGISTRATION_TOOL_POLICIES,
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
    defaultInstanceRole: 'capability',
    defaultInstanceTitle: '썸네일 분석 능력',
    officeResponsibility: '썸네일 품질과 컴플라이언스 리스크를 분석한다.',
    officeOwnerAgentType: 'listing',
    officeOrder: 510,
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
    defaultInstanceRole: 'employee',
    defaultInstanceTitle: '고객/운영 응대 담당',
    officeResponsibility: '운영자가 묻는 내용을 맥락화하고 대화형 응답을 제공한다.',
    officeOwnerAgentType: null,
    officeOrder: 300,
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
  definition: Pick<AgentDefinitionRecord, 'defaultAdapterType' | 'defaultModelEnv'>,
): string | null {
  const specific = process.env[definition.defaultModelEnv];
  if (specific && specific.length > 0) return specific;
  if (definition.defaultModelEnv.startsWith('AI_')) return null;
  if (definition.defaultAdapterType === 'gemini_image') return null;
  const shared = process.env.AGENT_DEFAULT_MODEL;
  return shared && shared.length > 0 ? shared : null;
}

export interface AgentModelPlanResolution {
  modelPlan: AgentModelPlan | null;
  missingRole?: Exclude<AgentModelPlanRole, 'primary'>;
  missingEnv?: string;
}

export function resolveDefinitionModelPlan(
  definition: Pick<AgentDefinitionRecord, 'defaultAuxiliaryModelEnvs'>,
  primaryModel: string,
): AgentModelPlanResolution {
  const primary = primaryModel.trim();
  if (!primary) return { modelPlan: null };

  const modelPlan: AgentModelPlan = { primary };
  for (const role of ['image', 'vision', 'verify'] as const) {
    const envName = definition.defaultAuxiliaryModelEnvs[role];
    if (!envName) continue;
    const value = process.env[envName]?.trim();
    if (!value) {
      return {
        modelPlan: null,
        missingRole: role,
        missingEnv: envName,
      };
    }
    modelPlan[role] = value;
  }
  return { modelPlan };
}

function toRecord(definition: AgentDefinitionSeed): AgentDefinitionRecord {
  return {
    ...definition,
    id: definition.type,
    catalogStatus: definition.catalogStatus ?? 'active',
    marketplaceId: definition.marketplaceId ?? null,
    defaultAuxiliaryModelEnvs: definition.defaultAuxiliaryModelEnvs ?? {},
    defaultToolPolicies: definition.defaultToolPolicies ?? [],
    defaultSkillKeys: [...(definition.defaultSkillKeys ?? [])],
    delegationRole: definition.delegationRole ?? 'leaf',
  };
}
