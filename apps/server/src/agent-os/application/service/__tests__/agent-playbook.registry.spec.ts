import { describe, expect, it } from 'vitest';
import {
  COUPANG_LISTING_SUBMISSION_PLAYBOOK,
  CONFIRMED_CHANNEL_LISTING_REGISTRATION_PLAYBOOK,
  PURCHASE_ORDER_SUBMISSION_PLAYBOOK,
  findAgentPlaybook,
  listAgentPlaybooks,
} from '../agent-playbook.registry';

describe('agent playbook registry', () => {
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
