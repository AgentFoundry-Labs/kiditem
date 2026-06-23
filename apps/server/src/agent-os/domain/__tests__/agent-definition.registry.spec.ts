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

  it('registers Operator, Listing, Order Agent, and Channel Registration with default tool policies', () => {
    const manager = findAgentDefinitionByType('manager');
    const listing = findAgentDefinitionByType('listing');
    const order = findAgentDefinitionByType('order');
    const channelRegistration = findAgentDefinitionByType('channel_registration');

    expect(manager).toMatchObject({
      name: 'Operator',
      runtimeKind: 'coordinator',
      delegationRole: 'orchestrator',
    });
    expect(manager?.defaultToolPolicies).toEqual([]);
    const sourcing = findAgentDefinitionByType('sourcing');
    expect(sourcing?.defaultSkillKeys).toEqual(['sourcing.magic_scraper']);
    expect(sourcing?.defaultToolPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolKey: 'sourcing.scrapeProductUrl',
          effect: 'allow',
        }),
      ]),
    );
    expect(sourcing?.defaultToolPolicies.map((policy) => policy.toolKey)).not.toContain(
      'product_listing.create_generation_package',
    );
    expect(listing).toMatchObject({
      name: 'Listing Agent',
      runtimeKind: 'agent',
      delegationRole: 'leaf',
      defaultModelEnv: 'AGENT_LISTING_MODEL',
    });
    expect(listing?.defaultToolPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolKey: 'product_listing.create_generation_package',
          effect: 'allow',
        }),
        expect.objectContaining({
          toolKey: 'product_listing.submit_wing_thumbnail',
          effect: 'approval_required',
          approvalMode: 'admin',
        }),
      ]),
    );
    expect(order).toMatchObject({
      name: 'Order Agent',
      runtimeKind: 'agent',
      delegationRole: 'leaf',
    });
    expect(order?.defaultToolPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolKey: 'supply.submit_purchase_order',
          effect: 'approval_required',
          approvalMode: 'admin',
          dryRunMode: 'disabled',
        }),
      ]),
    );
    expect(channelRegistration).toMatchObject({
      name: 'Channel Registration Agent',
      runtimeKind: 'agent',
      delegationRole: 'leaf',
      defaultModelEnv: 'AGENT_CHANNEL_REGISTRATION_MODEL',
    });
    expect(channelRegistration?.defaultToolPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolKey: 'channels.register_confirmed_listing',
          effect: 'approval_required',
          approvalMode: 'admin',
          dryRunMode: 'disabled',
        }),
      ]),
    );
  });

  it('keeps all non-Operator Agent OS definitions as leaf agents', () => {
    const definitions = listAgentDefinitions();

    expect(
      definitions
        .filter((definition) => definition.delegationRole === 'orchestrator')
        .map((definition) => definition.type),
    ).toEqual(['manager']);
    expect(
      definitions
        .filter((definition) => definition.type !== 'manager')
        .every((definition) => definition.delegationRole === 'leaf'),
    ).toBe(true);
  });
});
