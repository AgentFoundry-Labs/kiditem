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

  it('classifies code-owned Agent OS definitions as employees or capabilities', () => {
    const definitionsByType = new Map(
      listAgentDefinitions().map((definition) => [definition.type, definition]),
    );

    expect(definitionsByType.get('manager')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '운영 총괄',
    });
    expect(definitionsByType.get('sourcing')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '소싱 담당',
    });
    expect(definitionsByType.get('listing')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '상품 등록 담당',
    });
    expect(definitionsByType.get('order')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '발주 담당',
    });
    expect(definitionsByType.get('channel_registration')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '채널 등록 담당',
    });
    expect(definitionsByType.get('ad_strategy')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '광고 전략 담당',
    });
    expect(definitionsByType.get('chat')).toMatchObject({
      defaultInstanceRole: 'employee',
      defaultInstanceTitle: '고객/운영 응대 담당',
    });
    expect(definitionsByType.get('rules_evaluation')).toMatchObject({
      defaultInstanceRole: 'capability',
      defaultInstanceTitle: '룰 평가 능력',
    });
    expect(definitionsByType.get('rules_suggest')).toMatchObject({
      defaultInstanceRole: 'capability',
      defaultInstanceTitle: '임계값 제안 능력',
    });
    expect(definitionsByType.get('thumbnail_analyst')).toMatchObject({
      defaultInstanceRole: 'capability',
      defaultInstanceTitle: '썸네일 분석 능력',
    });
  });

  it('owns the complete deterministic office roster', () => {
    const definitions = listAgentDefinitions()
      .filter((definition) => definition.catalogStatus === 'active')
      .sort((left, right) => left.officeOrder - right.officeOrder);

    expect(definitions.map((definition) => definition.type)).toEqual([
      'manager',
      'rules_evaluation',
      'rules_suggest',
      'ad_strategy',
      'chat',
      'sourcing',
      'listing',
      'thumbnail_analyst',
      'order',
      'channel_registration',
    ]);
    expect(new Set(definitions.map((definition) => definition.officeOrder)).size).toBe(
      definitions.length,
    );

    const definitionsByType = new Map(
      definitions.map((definition) => [definition.type, definition]),
    );
    for (const definition of definitions) {
      if (definition.defaultInstanceRole === 'employee') {
        expect(definition.officeOwnerAgentType).toBeNull();
        continue;
      }
      const owner = definitionsByType.get(definition.officeOwnerAgentType ?? '');
      expect(owner?.defaultInstanceRole).toBe('employee');
    }
  });
});
