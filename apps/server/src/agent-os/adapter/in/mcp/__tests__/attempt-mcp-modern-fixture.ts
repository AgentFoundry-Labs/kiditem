import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, type McpHttpHandler } from '@modelcontextprotocol/server';
import { z as z4 } from 'zod-v4';
import type {
  AttemptMcpActionsPort,
  AttemptMcpBinding,
} from '../../../../application/port/in/mcp/attempt-mcp-actions.port';

export const ATTEMPT_MCP_TEST_BINDING: AttemptMcpBinding = {
  attemptId: 'attempt-id',
  sessionId: 'session-id',
  taskId: 'task-id',
  agentVersionId: 'agent-version-id',
  organizationId: 'organization-id',
  userId: 'user-id',
  capabilityKeys: ['sourcing.scrapeProductUrl'],
};

export function attemptMcpActions(
  overrides: Partial<AttemptMcpActionsPort> = {},
): AttemptMcpActionsPort {
  return {
    assertBinding: async () => undefined,
    catalog: async () => [],
    invoke: async () => ({ accepted: true }),
    invocation: async () => ({ status: 'authorized' }),
    delegate: async () => ({ childTaskId: '018f4eb1-9078-7a1e-9514-b19b5732f5de' }),
    child: async () => ({ status: 'open' }),
    ...overrides,
  };
}

export function pinnedModernClient(): Client {
  return new Client(
    { name: 'attempt-mcp-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
}

/** Explicit pre-v2 negotiation used to prove no compatibility fallback exists. */
export function pinned2025Client(): Client {
  return new Client(
    { name: 'attempt-mcp-2025-client', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2025-06-18' } } },
  );
}

/** A client that does not pin v2 must not quietly select a legacy protocol. */
export function quietDefaultClient(): Client {
  return new Client({ name: 'attempt-mcp-default-client', version: '1.0.0' });
}

export function transportFor(handler: McpHttpHandler): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL('http://kiditem.test/mcp'), {
    fetch: (input, init) => {
      const request = input instanceof Request
        ? input
        : new Request(input instanceof URL ? input : String(input), init);
      return handler.fetch(request);
    },
  });
}
