export interface AgentPlaybookStep {
  key: string;
  agentType: 'manager' | 'sourcing' | 'order';
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

export function findAgentPlaybook(key: string): AgentPlaybook | null {
  return key === SOURCING_MARKET_OPPORTUNITY_PLAYBOOK.key
    ? SOURCING_MARKET_OPPORTUNITY_PLAYBOOK
    : null;
}
