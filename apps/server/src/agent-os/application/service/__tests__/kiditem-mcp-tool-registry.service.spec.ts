import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { AgentCapabilityHandler } from '../../port/out/capability/agent-capability-handler.port';
import type { AgentCapabilityRegistry } from '../agent-capability-registry.service';
import {
  KidItemMcpToolRegistry,
  mcpToolNameForCapability,
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
  it('exposes first-class MCP tools by Agent OS role and agent manifest allowlist', () => {
    const sourcingScrape = handler('sourcing.scrapeProductUrl');
    const listingPackage = handler('product_listing.create_generation_package');
    const purchaseSubmit = handler('supply.submit_purchase_order');
    const handlers = new Map([
      [sourcingScrape.key, sourcingScrape],
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
      'agent_os_finalize_task',
      'sourcing_scrape_url',
    ]);
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

  it('exposes only curated KidItem domain capabilities to Hermes provider sessions', () => {
    const registry = {
      list: () => [
        handler('supplier1688.match_products'),
        handler('channels.submit_coupang_listing'),
        handler('delegate_task'),
        handler('memory.search'),
        handler('terminal.exec'),
      ],
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(mcpRegistry.listTools()).toEqual([
      expect.objectContaining({
        name: 'kiditem__supplier1688_match_products',
        capabilityKey: 'supplier1688.match_products',
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
    const supplier = handler('supplier1688.match_products');
    const registry = {
      list: () => [supplier],
      resolve: (key: string) => (key === supplier.key ? supplier : null),
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(
      mcpRegistry.resolveTool('kiditem__supplier1688_match_products')?.handler,
    ).toBe(supplier);
  });

  it('does not resolve ambiguous generated MCP tool names among exposed handlers', () => {
    const exposed = handler('supplier1688.match_products');
    const collision = handler('supplier1688_match.products');
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
      mcpRegistry.resolveTool('kiditem__supplier1688_match_products'),
    ).toBeNull();
    expect(
      mcpRegistry.resolveCapabilityKey('supplier1688.match_products')?.handler,
    ).toBe(exposed);
    expect(
      mcpRegistry.resolveCapabilityKey('supplier1688_match.products')?.handler,
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
    const supplier = handler('supplier1688.match_products');
    const registry = {
      list: () => [supplier],
      resolve: (key: string) => (key === supplier.key ? supplier : null),
    } as unknown as AgentCapabilityRegistry;

    const mcpRegistry = new KidItemMcpToolRegistry(registry);

    expect(
      mcpRegistry.resolveCapabilityKey('supplier1688.match_products')?.handler,
    ).toBe(supplier);
  });

  it('does not resolve a registered non-allowlisted capability whose MCP tool name collides with an exposed key', () => {
    const exposed = handler('supplier1688.match_products');
    const collision = handler('supplier1688:match_products');
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
