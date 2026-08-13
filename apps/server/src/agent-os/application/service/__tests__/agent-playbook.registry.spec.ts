import { describe, expect, it } from 'vitest';
import {
  COUPANG_LISTING_SUBMISSION_PLAYBOOK,
  CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
  PURCHASE_ORDER_SUBMISSION_PLAYBOOK,
  MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK,
  SOURCING_MARKET_RESEARCH_PLAYBOOK,
  SOURCING_REVIEW_HANDOFF_PLAYBOOK,
  SOURCING_WORKSPACE_QUESTION_PLAYBOOK,
  findAgentPlaybook,
  listAgentPlaybooks,
} from '../agent-playbook.registry';

describe('agent playbook registry', () => {
  it('defines artifact/run-oriented sourcing playbooks without purchase handoff', () => {
    expect(findAgentPlaybook('sourcing_workspace_question_v1')).toBe(
      SOURCING_WORKSPACE_QUESTION_PLAYBOOK,
    );
    expect(findAgentPlaybook('sourcing_market_research_v2')).toBe(
      SOURCING_MARKET_RESEARCH_PLAYBOOK,
    );
    expect(findAgentPlaybook('manual_product_intake_from_url_v2')).toBe(
      MANUAL_PRODUCT_INTAKE_FROM_URL_PLAYBOOK,
    );
    expect(findAgentPlaybook('sourcing_review_handoff_v1')).toBe(
      SOURCING_REVIEW_HANDOFF_PLAYBOOK,
    );
    expect(SOURCING_MARKET_RESEARCH_PLAYBOOK.steps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityKey: 'supply.create_purchase_order_draft' }),
      ]),
    );
  });

  it('lists confirmed channel listing registration as an Operator-visible playbook', () => {
    expect(listAgentPlaybooks()).toContain(
      CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
    );
    expect(findAgentPlaybook('confirmed_channel_listing_registration_v1')).toBe(
      CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
    );
    expect(CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK.steps).toContainEqual({
      key: 'channel_registration',
      agentType: 'channel_registration',
      capabilityKey: 'channels.register_confirmed_listing',
      dependsOn: ['operator', 'user_selection'],
    });
  });

  it('lists Coupang listing submission as an Operator-visible playbook', () => {
    expect(listAgentPlaybooks()).toContain(COUPANG_LISTING_SUBMISSION_PLAYBOOK);
    expect(findAgentPlaybook('coupang_listing_submission_v1')).toBe(
      COUPANG_LISTING_SUBMISSION_PLAYBOOK,
    );
    expect(COUPANG_LISTING_SUBMISSION_PLAYBOOK.steps).toContainEqual({
      key: 'channel_registration',
      agentType: 'channel_registration',
      capabilityKey: 'channels.submit_coupang_listing',
      dependsOn: ['operator', 'user_selection'],
    });
  });

  it('lists purchase order submission as an Operator-visible playbook', () => {
    expect(listAgentPlaybooks()).toContain(PURCHASE_ORDER_SUBMISSION_PLAYBOOK);
    expect(findAgentPlaybook('purchase_order_submission_v1')).toBe(
      PURCHASE_ORDER_SUBMISSION_PLAYBOOK,
    );
    expect(PURCHASE_ORDER_SUBMISSION_PLAYBOOK.steps).toContainEqual({
      key: 'order_submit',
      agentType: 'order',
      capabilityKey: 'supply.submit_purchase_order',
      dependsOn: ['operator', 'user_selection'],
    });
  });
});
