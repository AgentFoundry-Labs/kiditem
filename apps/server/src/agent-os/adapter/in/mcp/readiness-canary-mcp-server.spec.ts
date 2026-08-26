import { describe, expect, it, vi } from 'vitest';
import {
  CAPABILITY_MCP_TOOL_NAMES,
  MCP_PROTOCOL_VERSION,
} from './capability-mcp-wire-contract';
import {
  createRequestScopedCapabilityMcpHandler,
  type CapabilityMcpDependencies,
} from './kiditem-agent-os-mcp-server';
import {
  McpRuntimeReadinessError,
  McpRuntimeReadinessService,
  runMcpReadinessCanary,
} from './readiness-canary-mcp-server';

describe('MCP v2 readiness canary', () => {
  it('proves legacy rejection plus independent 2026 discovery/list/call/output/input_required exchanges', async () => {
    const readiness = new McpRuntimeReadinessService({
      MCP_SDK_GENERATION: 'v2',
      MCP_PROTOCOL_NEGOTIATION: 'auto',
    });
    const dependencies = {
      invocations: {
        invoke: vi.fn(async () => ({
          kind: 'input_required' as const,
          invocationId: '00000000-0000-4000-8000-000000000003',
          status: 'pending' as const,
          approvalStatus: 'pending' as const,
          approvalExpiresAt: new Date('2026-08-26T00:00:00.000Z'),
        })),
        get: vi.fn(),
      },
      capabilities: {
        listDefinitions: () => [],
        resolveDefinition: () => null,
      },
      operations: { get: vi.fn() },
      readiness,
      webOrigin: 'https://kiditem.test',
    } as unknown as CapabilityMcpDependencies;
    const activeTurn = {
      executionId: 'execution-1',
      installationId: 'installation-1',
      gatewayInstanceId: 'gateway-1',
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    };
    const createHandler = vi.fn(() => createRequestScopedCapabilityMcpHandler(dependencies, () => activeTurn));

    await expect(runMcpReadinessCanary({
      createHandler,
      inputRequiredCall: {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: 'supply.create_purchase_order_draft',
          requestKey: 'purchase-order-1',
          actingAgentKey: 'supply',
          input: { purchaseOrderId: '00000000-0000-4000-8000-000000000005' },
        },
      },
    })).resolves.toBeUndefined();
    expect(createHandler).toHaveBeenCalledTimes(5);
    expect(readiness.probe()).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      toolNames: CAPABILITY_MCP_TOOL_NAMES,
    });
  });

  it('fails readiness instead of accepting v1 or fallback configuration', () => {
    expect(() => new McpRuntimeReadinessService({
      MCP_SDK_GENERATION: 'v1',
      MCP_PROTOCOL_NEGOTIATION: 'fallback',
    }).probe()).toThrow(McpRuntimeReadinessError);
    expect(() => new McpRuntimeReadinessService({}).probe()).toThrow(McpRuntimeReadinessError);
  });
});
