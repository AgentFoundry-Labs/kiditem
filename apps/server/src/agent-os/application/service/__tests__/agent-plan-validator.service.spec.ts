import { describe, expect, it } from 'vitest';
import { AgentPlanValidator } from '../agent-plan-validator.service';
import {
  CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
  MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK,
  PURCHASE_ORDER_SUBMISSION_PLAYBOOK,
  SOURCING_MARKET_OPPORTUNITY_PLAYBOOK,
  findAgentPlaybook,
} from '../agent-playbook.registry';

describe('AgentPlanValidator', () => {
  it('accepts the sourcing market opportunity playbook', () => {
    const validator = new AgentPlanValidator();
    const result = validator.validate(SOURCING_MARKET_OPPORTUNITY_PLAYBOOK);

    expect(result.ok).toBe(true);
  });

  it('accepts the manual product intake from URL playbook', () => {
    const validator = new AgentPlanValidator();
    const result = validator.validate(MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK);

    expect(result.ok).toBe(true);
    expect(findAgentPlaybook('manual_product_intake_from_url_v1')).toBe(
      MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK,
    );
  });

  it('accepts confirmed channel listing registration through the channel registration agent', () => {
    const validator = new AgentPlanValidator();
    const result = validator.validate(CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK);

    expect(result.ok).toBe(true);
    expect(findAgentPlaybook('confirmed_channel_listing_registration_v1')).toBe(
      CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
    );
  });

  it('accepts purchase order submission through the order agent', () => {
    const validator = new AgentPlanValidator();
    const result = validator.validate(PURCHASE_ORDER_SUBMISSION_PLAYBOOK);

    expect(result.ok).toBe(true);
    expect(findAgentPlaybook('purchase_order_submission_v1')).toBe(
      PURCHASE_ORDER_SUBMISSION_PLAYBOOK,
    );
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
