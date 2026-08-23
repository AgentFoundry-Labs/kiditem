import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { AgentCapabilityHandler } from '../../port/out/capability/agent-capability-handler.port';
import type { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import {
  KidItemMcpToolRegistry,
  mcpToolNameForCapability,
  modelFacingMcpToolNamesForAgentType,
} from '../kiditem-mcp-tool-registry.service';

function handler(key: string): AgentCapabilityHandler {
  return {
    key,
    ownerDomain: key.split('.')[0] ?? 'agent-os',
    executionKind: 'tool',
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    sideEffects: ['external_io'],
    approvalRisk: 'medium',
    idempotencyKey: () => null,
    execute: async () => ({}),
  };
}

describe('KidItemMcpToolRegistry', () => {
  it('keeps terminal control and raw Playwright outside the Sourcing model surface', () => {
    const names = modelFacingMcpToolNamesForAgentType('sourcing');
    expect(names).not.toContain('agent_os_finalize_task');
    expect(names).not.toContain('sourcing_scrape_url');
    expect(names).not.toContain('sourcing_scrape_url_workflow');
  });

  it('exposes first-class MCP tools by Agent OS role and agent manifest allowlist', () => {
    const marketShadow = {
      ...handler('market.collect_shadow_signals'),
      ownerDomain: 'sourcing',
      executionKind: 'job_trigger' as const,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        operationRunId: z.string().uuid(),
        status: z.string(),
      }),
      sideEffects: ['db_write', 'external_io', 'job_enqueue'],
      approvalRisk: 'low' as const,
    } satisfies AgentCapabilityHandler;
    const sourcingEvidence = handler('sourcing.retrieveWorkspaceEvidence');
    const sourcingScrapeWorkflow = handler('sourcing.scrapeUrlWorkflow');
    const listingPackage = handler('product_listing.create_generation_package');
    const purchaseSubmit = handler('supply.submit_purchase_order');
    const handlers = new Map([
      [marketShadow.key, marketShadow],
      [sourcingEvidence.key, sourcingEvidence],
      [sourcingScrapeWorkflow.key, sourcingScrapeWorkflow],
      [listingPackage.key, listingPackage],
      [purchaseSubmit.key, purchaseSubmit],
    ]);
    const registry = {
      list: () => [...handlers.values()],
      resolve: (key: string) => handlers.get(key) ?? null,
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(
      mcpRegistry.listToolsForContext({ agentType: 'manager' }).map((tool) => tool.name),
    ).toEqual([
      'agent_os_read_context',
      'agent_os_read_task_graph',
      'agent_os_read_artifacts',
      'agent_os_finalize_task',
      'agent_os_list_agents',
      'agent_os_create_task',
      'agent_os_request_user_input',
    ]);
    expect(
      mcpRegistry.listToolsForContext({ agentType: 'sourcing' }).map((tool) => tool.name),
    ).toEqual([
      'agent_os_read_context',
      'agent_os_read_task_graph',
      'agent_os_read_artifacts',
      'sourcing_retrieve_workspace_evidence',
    ]);
    const shadowDescriptors = mcpRegistry.listToolsForContext({
      agentType: 'sourcing',
    }).filter((tool) => tool.capabilityKey === 'market.collect_shadow_signals');
    expect(shadowDescriptors).toEqual([]);
    const resolvedShadow = mcpRegistry.resolveTool(
      'market_collect_shadow_signals',
      { agentType: 'sourcing' },
    );
    expect(resolvedShadow).toBeNull();
    const manualIntakeContext = {
      agentType: 'sourcing',
      playbookKey: 'manual_product_intake_from_url_v2',
      planStepKey: 'sourcing_agent',
    } as const;
    expect(
      mcpRegistry.listToolsForContext(manualIntakeContext).map((tool) => tool.name),
    ).toEqual([
      'agent_os_read_context',
      'agent_os_read_task_graph',
      'agent_os_read_artifacts',
      'sourcing_retrieve_workspace_evidence',
      'sourcing_scrape_url_workflow',
    ]);
    expect(
      mcpRegistry.resolveTool('sourcing_scrape_url_workflow', {
        agentType: 'sourcing',
      }),
    ).toBeNull();
    expect(
      mcpRegistry.resolveTool(
        'sourcing_scrape_url_workflow',
        manualIntakeContext,
      )?.handler,
    ).toBe(sourcingScrapeWorkflow);
    expect(
      mcpRegistry.listToolsForContext({ agentType: 'listing' }).map((tool) => tool.name),
    ).toEqual([
      'agent_os_read_context',
      'agent_os_read_task_graph',
      'agent_os_read_artifacts',
      'agent_os_finalize_task',
      'listing_create_generation_package',
    ]);
  });

  it('exposes only curated KidItem domain capabilities to model-provider sessions', () => {
    const registry = {
      list: () => [
        handler('sourcing.refreshCollection'),
        handler('channels.submit_coupang_listing'),
        handler('delegate_task'),
        handler('memory.search'),
        handler('terminal.exec'),
      ],
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(mcpRegistry.listTools()).toEqual([
      expect.objectContaining({
        name: 'kiditem__sourcing_refreshCollection',
        capabilityKey: 'sourcing.refreshCollection',
      }),
      expect.objectContaining({
        name: 'kiditem__channels_submit_coupang_listing',
        capabilityKey: 'channels.submit_coupang_listing',
      }),
    ]);
    expect(mcpRegistry.listTools().map((tool) => tool.capabilityKey)).not.toContain(
      'delegate_task',
    );
    expect(mcpRegistry.listTools().map((tool) => tool.capabilityKey)).not.toContain(
      'terminal.exec',
    );
  });

  it('resolves an MCP tool name back to the capability handler', () => {
    const supplier = handler('sourcing.refreshCollection');
    const registry = {
      list: () => [supplier],
      resolve: (key: string) => (key === supplier.key ? supplier : null),
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(
      mcpRegistry.resolveTool('kiditem__sourcing_refreshCollection')?.handler,
    ).toBe(supplier);
  });

  it('does not resolve ambiguous generated MCP tool names among exposed handlers', () => {
    const exposed = handler('sourcing.refreshCollection');
    const collision = handler('sourcing_refreshCollection');
    const handlers = new Map([
      [exposed.key, exposed],
      [collision.key, collision],
    ]);
    const registry = {
      list: () => [exposed, collision],
      resolve: (key: string) => handlers.get(key) ?? null,
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);
    (
      mcpRegistry as unknown as {
        allowlist: Set<string>;
      }
    ).allowlist.add(collision.key);

    expect(mcpToolNameForCapability(collision.key)).toBe(
      mcpToolNameForCapability(exposed.key),
    );
    expect(
      mcpRegistry.resolveTool('kiditem__sourcing_refreshCollection'),
    ).toBeNull();
    expect(
      mcpRegistry.resolveCapabilityKey('sourcing.refreshCollection')?.handler,
    ).toBe(exposed);
    expect(
      mcpRegistry.resolveCapabilityKey('sourcing_refreshCollection')?.handler,
    ).toBe(collision);
  });

  it('uses the exported MCP tool-name mapping for capability keys', () => {
    expect(mcpToolNameForCapability('channels.submit_coupang_listing')).toBe(
      'kiditem__channels_submit_coupang_listing',
    );
    expect(mcpToolNameForCapability('browser:navigate')).toBe(
      'kiditem__browser_navigate',
    );
  });

  it('resolves an exposed capability key through its MCP tool name', () => {
    const supplier = handler('sourcing.refreshCollection');
    const registry = {
      list: () => [supplier],
      resolve: (key: string) => (key === supplier.key ? supplier : null),
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(
      mcpRegistry.resolveCapabilityKey('sourcing.refreshCollection')?.handler,
    ).toBe(supplier);
  });

  it('does not resolve a registered non-allowlisted capability whose MCP tool name collides with an exposed key', () => {
    const exposed = handler('sourcing.refreshCollection');
    const collision = handler('sourcing:refreshCollection');
    const handlers = new Map([
      [exposed.key, exposed],
      [collision.key, collision],
    ]);
    const registry = {
      list: () => [exposed, collision],
      resolve: (key: string) => handlers.get(key) ?? null,
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(mcpToolNameForCapability(collision.key)).toBe(
      mcpToolNameForCapability(exposed.key),
    );
    expect(mcpRegistry.resolveCapabilityKey(collision.key)).toBeNull();
  });

  it.each([
    'delegate_task',
    'terminal.exec',
    'file.write',
    'browser_navigate',
    'sourcing.internal_admin',
  ])('does not resolve forbidden or non-allowlisted capability %s', (key) => {
    const registeredHandler = handler(key);
    const registry = {
      list: () => [registeredHandler],
      resolve: (capabilityKey: string) =>
        capabilityKey === key ? registeredHandler : null,
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(mcpRegistry.resolveCapabilityKey(key)).toBeNull();
    expect(mcpRegistry.resolveTool(mcpToolNameForCapability(key))).toBeNull();
  });
});
