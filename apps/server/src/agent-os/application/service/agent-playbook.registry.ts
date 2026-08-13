export interface AgentPlaybookStep {
  key: string;
  agentType: 'manager' | 'sourcing' | 'listing' | 'order' | 'channel_registration';
  capabilityKey?: string;
  dependsOn: string[];
}

export interface AgentPlaybook {
  key: string;
  steps: AgentPlaybookStep[];
}

export const SOURCING_WORKSPACE_QUESTION_PLAYBOOK: AgentPlaybook = {
  key: 'sourcing_workspace_question_v1',
  steps: [
    { key: 'sourcing_agent', agentType: 'sourcing', dependsOn: [] },
    {
      key: 'workspace_evidence',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
      dependsOn: ['sourcing_agent'],
    },
  ],
};

export const SOURCING_MARKET_RESEARCH_PLAYBOOK: AgentPlaybook = {
  key: 'sourcing_market_research_v2',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    { key: 'sourcing_agent', agentType: 'sourcing', dependsOn: ['operator'] },
    {
      key: 'workspace_evidence',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
      dependsOn: ['sourcing_agent'],
    },
    {
      key: 'recommendation_run',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.inspectRecommendationRun',
      dependsOn: ['workspace_evidence'],
    },
  ],
};

export const MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK: AgentPlaybook = {
  key: 'manual_product_intake_from_url_v2',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    { key: 'sourcing_agent', agentType: 'sourcing', dependsOn: ['operator'] },
    {
      key: 'scrape_url',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.scrapeUrlWorkflow',
      dependsOn: ['sourcing_agent'],
    },
  ],
};

export const SOURCING_REVIEW_HANDOFF_PLAYBOOK: AgentPlaybook = {
  key: 'sourcing_review_handoff_v1',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    { key: 'sourcing_agent', agentType: 'sourcing', dependsOn: ['operator'] },
    {
      key: 'review_batch',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.createReviewBatch',
      dependsOn: ['sourcing_agent', 'user_selection'],
    },
  ],
};

export const CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK: AgentPlaybook = {
  key: 'confirmed_channel_listing_registration_v1',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    {
      key: 'channel_registration',
      agentType: 'channel_registration',
      capabilityKey: 'channels.register_confirmed_listing',
      dependsOn: ['operator', 'user_selection'],
    },
  ],
};

export const COUPANG_LISTING_SUBMISSION_PLAYBOOK: AgentPlaybook = {
  key: 'coupang_listing_submission_v1',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    {
      key: 'channel_registration',
      agentType: 'channel_registration',
      capabilityKey: 'channels.submit_coupang_listing',
      dependsOn: ['operator', 'user_selection'],
    },
  ],
};

export const PURCHASE_ORDER_SUBMISSION_PLAYBOOK: AgentPlaybook = {
  key: 'purchase_order_submission_v1',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    {
      key: 'order_submit',
      agentType: 'order',
      capabilityKey: 'supply.submit_purchase_order',
      dependsOn: ['operator', 'user_selection'],
    },
  ],
};

const AGENT_PLAYBOOKS = [
  SOURCING_WORKSPACE_QUESTION_PLAYBOOK,
  SOURCING_MARKET_RESEARCH_PLAYBOOK,
  MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK,
  SOURCING_REVIEW_HANDOFF_PLAYBOOK,
  CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
  COUPANG_LISTING_SUBMISSION_PLAYBOOK,
  PURCHASE_ORDER_SUBMISSION_PLAYBOOK,
] as const;

export function listAgentPlaybooks(): readonly AgentPlaybook[] {
  return AGENT_PLAYBOOKS;
}

export function findAgentPlaybook(key: string): AgentPlaybook | null {
  return AGENT_PLAYBOOKS.find((playbook) => playbook.key === key) ?? null;
}
