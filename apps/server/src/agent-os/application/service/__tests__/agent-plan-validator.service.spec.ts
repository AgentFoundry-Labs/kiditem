import { describe, expect, it } from 'vitest';
import { AgentPlanValidator } from '../agent-plan-validator.service';
import { SOURCING_MARKET_OPPORTUNITY_PLAYBOOK } from '../agent-playbook.registry';

describe('AgentPlanValidator', () => {
  it('accepts the sourcing market opportunity playbook', () => {
    const validator = new AgentPlanValidator();
    const result = validator.validate(SOURCING_MARKET_OPPORTUNITY_PLAYBOOK);

    expect(result.ok).toBe(true);
  });

  it('rejects one-agent-per-tool plans that use an unknown agent', () => {
    const validator = new AgentPlanValidator();
    const result = validator.validate({
      key: 'bad_plan',
      steps: [
        {
          key: 'coupang-agent',
          agentType: 'coupang_agent',
          capabilityKey: 'coupang.match_products',
          dependsOn: [],
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      reason: 'agent_type_not_allowed',
      detail: 'coupang_agent',
    });
  });
});
