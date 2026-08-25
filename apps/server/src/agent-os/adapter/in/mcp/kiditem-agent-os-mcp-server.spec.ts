import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptMcpActionsPort } from '../../../application/port/in/mcp/attempt-mcp-actions.port';
import {
  ATTEMPT_MCP_TEST_BINDING,
  attemptMcpActions,
  pinned2025Client,
  pinnedModernClient,
  quietDefaultClient,
  transportFor,
} from './__tests__/attempt-mcp-modern-fixture';
import { createKidItemAgentOsMcpServer, mcpToolTurnId } from './kiditem-agent-os-mcp-server';
import { createRequestScopedAttemptMcpHandler } from '../http/runtime/attempt-mcp-http.controller';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import { AttemptMcpActionsService } from '../../../application/service/work/attempt-mcp-actions.service';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../../domain/catalog/final-capability.catalog';

describe('KidItem Agent OS MCP v2 server factory', () => {
  it('derives a bounded opaque live-input identity from the logical message command key', () => {
    expect(mcpToolTurnId('child-message-key-1')).toBe(mcpToolTurnId('child-message-key-1'));
    expect(mcpToolTurnId('child-message-key-1')).not.toBe(mcpToolTurnId('child-message-key-2'));
    expect(mcpToolTurnId('child-message-key-1')).toMatch(/^mcp-[a-f0-9]{64}$/);
  });

  it('uses the logical child-message key instead of transport request identity for exact replay', async () => {
    const child = vi.fn(async () => ({ status: 'open' }));
    const handler = createMcpHandler(
      () => createKidItemAgentOsMcpServer(attemptMcpActions({ child }), ATTEMPT_MCP_TEST_BINDING),
      { legacy: 'reject' },
    );
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(handler));
      await client.callTool({
        name: 'child_message',
        arguments: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de', message: 'Continue', messageCommandKey: 'child-message-key-1' },
      });
      await client.callTool({
        name: 'child_message',
        arguments: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de', message: 'Continue', messageCommandKey: 'child-message-key-1' },
      });
      await client.callTool({
        name: 'child_message',
        arguments: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de', message: 'Continue', messageCommandKey: 'child-message-key-2' },
      });

      expect(child).toHaveBeenCalledTimes(3);
      const [first, second, third] = child.mock.calls.map(([input]) => input as { turnId: string; action: string });
      expect(first).toMatchObject({ action: 'message', turnId: expect.stringMatching(/^mcp-[a-f0-9]{64}$/) });
      expect(second).toMatchObject({ action: 'message', turnId: expect.stringMatching(/^mcp-[a-f0-9]{64}$/) });
      expect(third).toMatchObject({ action: 'message', turnId: expect.stringMatching(/^mcp-[a-f0-9]{64}$/) });
      expect(second.turnId).toBe(first.turnId);
      expect(third.turnId).not.toBe(first.turnId);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('serves the exact eleven strict tools and output schemas over a pinned modern HTTP client', async () => {
    const actions = attemptMcpActions();
    const handler = createMcpHandler((context) => {
      expect(context.era).toBe('modern');
      return createKidItemAgentOsMcpServer(actions, ATTEMPT_MCP_TEST_BINDING, '018f4eb1-9078-7a1e-9514-b19b5732f5de');
    }, { legacy: 'reject' });
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(handler));
      expect(client.getProtocolEra()).toBe('modern');
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'capability_catalog_search',
        'capability_invoke',
        'invocation_status',
        'invocation_wait',
        'invocation_result',
        'delegate_to_agent',
        'child_status',
        'child_wait',
        'child_result',
        'child_message',
        'child_interrupt',
      ]);
      for (const tool of listed.tools) {
        expect(tool.inputSchema).toMatchObject({ additionalProperties: false });
        expect(tool.outputSchema).toBeDefined();
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('discovers all 18 final CapabilityDefinitions, including all ten Sourcing definitions, through the business MCP catalog tool', async () => {
    const registry = new AgentCapabilityRegistry();
    for (const definition of FINAL_CAPABILITY_DEFINITIONS) registry.registerDefinition(definition);
    const assertAttemptMcpBinding = vi.fn().mockResolvedValue(true);
    const actions = new AttemptMcpActionsService(
      { invoke: vi.fn(), authorize: vi.fn() } as never,
      { delegate: vi.fn() } as never,
      { assertAttemptMcpBinding } as never,
      { send: vi.fn(), interrupt: vi.fn() } as never,
      undefined,
      registry,
    );
    const handler = createRequestScopedAttemptMcpHandler(actions, {
      ...ATTEMPT_MCP_TEST_BINDING,
      capabilityKeys: FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key),
    });
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(handler));
      const response = await client.callTool({
        name: 'capability_catalog_search',
        arguments: { query: '' },
      });
      expect(response.structuredContent).toEqual({ ok: true, result: expect.any(Array) });
      const result = (response.structuredContent as { ok: true; result: Array<{ key: string }> }).result;
      expect(result).toHaveLength(18);
      expect(result.map((definition) => definition.key)).toEqual(
        FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key),
      );
      expect(result.filter((definition) => definition.key.startsWith('sourcing.'))).toHaveLength(10);
      expect(assertAttemptMcpBinding).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('uses the immutable server-bound binding and invokes an application action exactly once', async () => {
    const invoke = vi.fn().mockResolvedValue({ accepted: true });
    const actions = attemptMcpActions({ invoke });
    const binding = { ...ATTEMPT_MCP_TEST_BINDING, capabilityKeys: [...ATTEMPT_MCP_TEST_BINDING.capabilityKeys] };
    const handler = createMcpHandler(
      () => createKidItemAgentOsMcpServer(actions, binding, '018f4eb1-9078-7a1e-9514-b19b5732f5de'),
      { legacy: 'reject' },
    );
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(handler));
      const result = await client.callTool({
        name: 'capability_invoke',
        arguments: { capabilityKey: 'sourcing.scrapeProductUrl', input: { url: 'https://example.test/item' } },
      });
      expect(result).toMatchObject({
        structuredContent: { ok: true, result: { accepted: true } },
      });
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith({
        invocationId: '018f4eb1-9078-7a1e-9514-b19b5732f5de',
        binding: expect.objectContaining({ userId: 'user-id', organizationId: 'organization-id' }),
        capabilityKey: 'sourcing.scrapeProductUrl',
        input: { url: 'https://example.test/item' },
      });
      binding.capabilityKeys.push('forged.capability');
      expect(invoke.mock.calls[0][0].binding.capabilityKeys).toEqual(['sourcing.scrapeProductUrl']);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects extra tool input before calling the action port', async () => {
    const catalog = vi.fn().mockResolvedValue([]);
    const actions = attemptMcpActions({ catalog });
    const handler = createMcpHandler(
      () => createKidItemAgentOsMcpServer(actions, ATTEMPT_MCP_TEST_BINDING),
      { legacy: 'reject' },
    );
    const client = pinnedModernClient();

    try {
      await client.connect(transportFor(handler));
      const rejected = await client.callTool({
        name: 'capability_catalog_search',
        arguments: { query: 'sourcing', forged: true },
      });
      expect(rejected.isError).toBe(true);
      expect(catalog).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('rejects an unknown key for every tool before any narrow action port call', async () => {
    const catalog = vi.fn().mockResolvedValue([]);
    const invoke = vi.fn().mockResolvedValue({ accepted: true });
    const invocation = vi.fn().mockResolvedValue({ status: 'authorized' });
    const delegate = vi.fn().mockResolvedValue({ childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' });
    const child = vi.fn().mockResolvedValue({ status: 'open' });
    const handler = createMcpHandler(
      () => createKidItemAgentOsMcpServer(
        attemptMcpActions({ catalog, invoke, invocation, delegate, child }),
        ATTEMPT_MCP_TEST_BINDING,
      ),
      { legacy: 'reject' },
    );
    const client = pinnedModernClient();
    const invocationId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
    const inputs = {
      capability_catalog_search: { query: '', forged: true },
      capability_invoke: { capabilityKey: 'sourcing.scrapeProductUrl', input: {}, forged: true },
      invocation_status: { invocationId, forged: true },
      invocation_wait: { invocationId, forged: true },
      invocation_result: { invocationId, forged: true },
      delegate_to_agent: { targetAgentKey: 'sourcing', objective: 'Review', forged: true },
      child_status: { childTaskId: invocationId, forged: true },
      child_wait: { childTaskId: invocationId, forged: true },
      child_result: { childTaskId: invocationId, forged: true },
      child_message: { childTaskId: invocationId, message: 'Continue', forged: true },
      child_interrupt: { childTaskId: invocationId, forged: true },
    } as const;

    try {
      await client.connect(transportFor(handler));
      for (const [name, arguments_] of Object.entries(inputs)) {
        await expect(client.callTool({ name, arguments: arguments_ })).resolves.toMatchObject({ isError: true });
      }
      expect(catalog).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      expect(invocation).not.toHaveBeenCalled();
      expect(delegate).not.toHaveBeenCalled();
      expect(child).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('normalizes thrown action errors and rejects a default-era client', async () => {
    const actions = attemptMcpActions({
      child: async () => { throw Object.assign(new Error('child denied'), { code: 'child_denied' }); },
    });
    const handler = createMcpHandler(
      () => createKidItemAgentOsMcpServer(actions, ATTEMPT_MCP_TEST_BINDING),
      { legacy: 'reject' },
    );
    const modern = pinnedModernClient();
    const legacy = quietDefaultClient();

    try {
      await modern.connect(transportFor(handler));
      const failed = await modern.callTool({
        name: 'child_status',
        arguments: { childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' },
      });
      expect(failed).toMatchObject({
        isError: true,
        structuredContent: { ok: false, error: { code: 'child_denied', message: 'child denied' } },
      });
      await expect(legacy.connect(transportFor(handler))).rejects.toThrow();
    } finally {
      await modern.close();
      await legacy.close();
      await handler.close();
    }
  });

  it('rejects explicit 2025 and quiet default negotiation before business tool invocation', async () => {
    const invoke = vi.fn().mockResolvedValue({ accepted: true });
    const actions = attemptMcpActions({ invoke });
    const clients = [pinned2025Client(), quietDefaultClient()];

    try {
      for (const client of clients) {
        const handler = createRequestScopedAttemptMcpHandler(actions, ATTEMPT_MCP_TEST_BINDING);
        await expect(client.connect(transportFor(handler))).rejects.toThrow();
        await handler.close();
      }
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      await Promise.all(clients.map((client) => client.close()));
    }
  });
});
