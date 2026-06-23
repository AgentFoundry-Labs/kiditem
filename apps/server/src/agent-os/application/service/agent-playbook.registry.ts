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

export const SOURCING_MARKET_OPPORTUNITY_PLAYBOOK: AgentPlaybook = {
  key: 'sourcing_market_opportunity_to_order_draft_v1',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    { key: 'sourcing_agent', agentType: 'sourcing', dependsOn: ['operator'] },
    {
      key: 'market_signal',
      agentType: 'sourcing',
      capabilityKey: 'market.collect_keyword_category_rankings',
      dependsOn: ['sourcing_agent'],
    },
    {
      key: 'coupang_match',
      agentType: 'sourcing',
      capabilityKey: 'coupang.match_products',
      dependsOn: ['market_signal'],
    },
    {
      key: 'coupang_tracking',
      agentType: 'sourcing',
      capabilityKey: 'coupang.collect_tracking_snapshot',
      dependsOn: ['coupang_match'],
    },
    {
      key: 'supplier_match',
      agentType: 'sourcing',
      capabilityKey: 'supplier1688.match_products',
      dependsOn: ['coupang_tracking'],
    },
    {
      key: 'score',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.score_opportunities',
      dependsOn: ['supplier_match'],
    },
    {
      key: 'recommendation',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.create_recommendation_packet',
      dependsOn: ['score'],
    },
    {
      key: 'order_draft',
      agentType: 'order',
      capabilityKey: 'supply.create_purchase_order_draft',
      dependsOn: ['recommendation', 'user_selection'],
    },
  ],
};

export const MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK: AgentPlaybook = {
  key: 'manual_product_intake_from_url_v1',
  steps: [
    { key: 'operator', agentType: 'manager', dependsOn: [] },
    { key: 'sourcing_agent', agentType: 'sourcing', dependsOn: ['operator'] },
    {
      key: 'scrape_url',
      agentType: 'sourcing',
      capabilityKey: 'sourcing.scrapeProductUrl',
      dependsOn: ['sourcing_agent'],
    },
    {
      key: 'listing_prep',
      agentType: 'listing',
      capabilityKey: 'product_listing.create_generation_package',
      dependsOn: ['scrape_url', 'user_selection'],
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
  SOURCING_MARKET_OPPORTUNITY_PLAYBOOK,
  MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK,
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
