import { Injectable } from '@nestjs/common';
import type { AgentPlaybook } from './agent-playbook.registry';

const ALLOWED_AGENT_TYPES = new Set(['manager', 'sourcing', 'order']);
const ALLOWED_CAPABILITIES = new Set([
  'market.collect_keyword_category_rankings',
  'coupang.match_products',
  'coupang.collect_tracking_snapshot',
  'supplier1688.match_products',
  'sourcing.score_opportunities',
  'sourcing.create_recommendation_packet',
  'supply.create_purchase_order_draft',
]);

export type PlanValidationResult =
  | { ok: true }
  | { ok: false; reason: string; detail: string };

interface AgentPlanCandidateStep {
  key: string;
  agentType: string;
  capabilityKey?: string;
  dependsOn: string[];
}

interface AgentPlanCandidate {
  key: string;
  steps: AgentPlanCandidateStep[];
}

@Injectable()
export class AgentPlanValidator {
  validate(playbook: AgentPlaybook | AgentPlanCandidate): PlanValidationResult {
    const keys = new Set(playbook.steps.map((step) => step.key));
    for (const step of playbook.steps) {
      if (!ALLOWED_AGENT_TYPES.has(step.agentType)) {
        return {
          ok: false,
          reason: 'agent_type_not_allowed',
          detail: step.agentType,
        };
      }
      if (step.capabilityKey && !ALLOWED_CAPABILITIES.has(step.capabilityKey)) {
        return {
          ok: false,
          reason: 'capability_not_allowed',
          detail: step.capabilityKey,
        };
      }
      for (const dependency of step.dependsOn) {
        if (dependency === 'user_selection') continue;
        if (!keys.has(dependency)) {
          return {
            ok: false,
            reason: 'dependency_not_found',
            detail: dependency,
          };
        }
      }
    }
    return { ok: true };
  }
}
