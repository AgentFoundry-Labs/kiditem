import { describe, expect, it } from 'vitest';
import type { ActiveAgentVersionRecord } from '../../../port/out/repository/interaction/agent-interaction.persistence.types';
import {
  FOUNDATION_CAPABILITY_KEYS,
  interactionCapabilityKeys,
} from '../interaction-authority-profile';

const version = (overrides: Partial<ActiveAgentVersionRecord> = {}): ActiveAgentVersionRecord => ({
  id: 'version-1',
  agentDefinitionKey: 'operator',
  version: 1,
  displayName: 'Operator',
  description: 'Operator',
  runtimeType: 'copilotkit_agui',
  modelIdentity: 'gpt-5.2',
  capabilityKeys: [...FOUNDATION_CAPABILITY_KEYS],
  policyDocument: {
    toolPolicies: FOUNDATION_CAPABILITY_KEYS.map((toolKey) => ({
      toolKey,
      effect: 'allow',
      approvalMode: 'none',
    })),
  },
  activatedAt: new Date('2026-08-22T00:00:00.000Z'),
  retiredAt: null,
  ...overrides,
});

describe('interaction authority profile', () => {
  it('includes only immutable manifest tools explicitly allowed without approval', () => {
    expect(interactionCapabilityKeys(version({
      agentDefinitionKey: 'sourcing',
      capabilityKeys: [
        'sourcing.retrieveWorkspaceEvidence',
        'sourcing.scrapeUrlWorkflow',
        'supply.submitPurchaseOrder',
        'unlisted.tool',
      ],
      policyDocument: {
        toolPolicies: [
          {
            toolKey: 'sourcing.retrieveWorkspaceEvidence',
            effect: 'allow',
            approvalMode: 'none',
          },
          {
            toolKey: 'sourcing.scrapeUrlWorkflow',
            effect: 'allow',
            approvalMode: 'none',
          },
          {
            toolKey: 'supply.submitPurchaseOrder',
            effect: 'approval_required',
            approvalMode: 'admin',
          },
          {
            toolKey: 'not-in-manifest',
            effect: 'allow',
            approvalMode: 'none',
          },
        ],
      },
    }))).toEqual([
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.scrapeUrlWorkflow',
    ]);
  });
});
