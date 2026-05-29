import { afterEach, describe, expect, it, vi } from 'vitest';
import { findAgentDefinitionByType, listAgentDefinitions } from '../agent-definition.registry';

describe('agent definition registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not register thumbnail auto edit as an Agent OS runtime definition', () => {
    const definitions = listAgentDefinitions();

    expect(definitions.map((definition) => definition.type)).not.toContain('thumbnail_auto_edit');
    expect(definitions.map((definition) => definition.defaultModelEnv)).not.toContain(
      'AGENT_THUMBNAIL_AUTO_EDIT_MODEL',
    );
  });

  it('does not register direct human AI generation jobs as Agent OS definitions', () => {
    const definitions = listAgentDefinitions();

    expect(definitions.map((definition) => definition.type)).not.toContain('image_edit');
    expect(definitions.map((definition) => definition.type)).not.toContain('detail_page_generate');
    expect(definitions.map((definition) => definition.type)).not.toContain('thumbnail_generate');
    expect(findAgentDefinitionByType('image_edit')).toBeNull();
    expect(findAgentDefinitionByType('detail_page_generate')).toBeNull();
    expect(findAgentDefinitionByType('thumbnail_generate')).toBeNull();
    expect(definitions.map((definition) => definition.defaultModelEnv)).not.toContain(
      'AGENT_IMAGE_EDIT_MODEL',
    );
    expect(definitions.map((definition) => definition.defaultModelEnv)).not.toContain(
      'AGENT_DETAIL_PAGE_GENERATE_MODEL',
    );
    expect(definitions.map((definition) => definition.defaultModelEnv)).not.toContain(
      'AGENT_THUMBNAIL_GENERATE_MODEL',
    );
  });

  it('registers Operator and Order Agent with default tool policies', () => {
    const manager = findAgentDefinitionByType('manager');
    const order = findAgentDefinitionByType('order');

    expect(manager).toMatchObject({
      name: 'Operator',
      runtimeKind: 'coordinator',
    });
    expect(manager?.defaultToolPolicies.map((policy) => policy.toolKey)).toContain(
      'sourcing.score_opportunities',
    );
    expect(order).toMatchObject({
      name: 'Order Agent',
      runtimeKind: 'agent',
    });
    expect(order?.defaultToolPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolKey: 'supply.submit_purchase_order',
          effect: 'approval_required',
          approvalMode: 'admin',
        }),
      ]),
    );
  });
});
