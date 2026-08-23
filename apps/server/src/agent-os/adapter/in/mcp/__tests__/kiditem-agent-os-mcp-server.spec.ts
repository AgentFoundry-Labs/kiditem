import { describe, expect, it } from 'vitest';
import { ATTEMPT_MCP_SOCKET_PATH, createKidItemAgentOsMcpServer } from '../kiditem-agent-os-mcp-server';

function registeredTools(server: unknown) {
  return (server as { _registeredTools: Record<string, unknown> })._registeredTools;
}

describe('KidItem Attempt MCP stdio server', () => {
  it('exposes only the Attempt-scoped capability, delegation, and child controls', async () => {
    const server = await createKidItemAgentOsMcpServer();
    expect(ATTEMPT_MCP_SOCKET_PATH).toBe('ATTEMPT_MCP_SOCKET_PATH');
    expect(Object.keys(registeredTools(server))).toEqual([
      'capability_catalog_search', 'capability_invoke', 'delegate_to_agent',
      'child_status', 'child_wait', 'child_result', 'child_message', 'child_interrupt',
    ]);
    expect(Object.keys(registeredTools(server))).not.toEqual(expect.arrayContaining([
      'cancel_task', 'reopen_task', 'delete_session',
    ]));
  });
});
