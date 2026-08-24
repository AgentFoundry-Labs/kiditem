import { describe, expect, it, vi } from 'vitest';
import { AttemptMcpHttpController } from '../attempt-mcp-http.controller';

const attemptId = '018f4eb1-9078-7a1e-9514-b19b5732f5de';
const leaseId = '118f4eb1-9078-7a1e-9514-b19b5732f5de';

describe('AttemptMcpHttpController', () => {
  it('validates bearer, path, lease, and durable binding before it creates a fresh modern-only handler', async () => {
    const binding = attemptBinding();
    const tokens = { requireBusiness: vi.fn(() => binding) };
    const leases = { requireReady: vi.fn(() => ({ runnerInstanceId: 'runner', leaseId })) };
    const actions = { assertBinding: vi.fn(async () => undefined) };
    const handler = { fetch: vi.fn(async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })), close: vi.fn(async () => undefined) };
    const factory = vi.fn(() => handler);
    const responses = { write: vi.fn(async () => undefined) };
    const controller = new AttemptMcpHttpController(tokens as never, leases as never, actions as never, responses as never, factory);
    const request = mcpRequest('attempt-token');

    await controller.mcp(attemptId, { jsonrpc: '2.0' }, request as never, {} as never);

    expect(tokens.requireBusiness).toHaveBeenCalledWith({ raw: 'attempt-token', attemptId, leaseId });
    expect(actions.assertBinding).toHaveBeenCalledWith(binding);
    expect(factory).toHaveBeenCalledWith(actions, binding);
    expect(handler.fetch).toHaveBeenCalledWith(expect.any(Request), { parsedBody: { jsonrpc: '2.0' } });
    expect(responses.write).toHaveBeenCalledWith(expect.any(Response), expect.anything(), expect.any(AbortSignal));
    expect(handler.close).toHaveBeenCalledOnce();
  });

  it('rejects an invalid Attempt bearer before durable actions or the MCP server factory can run', async () => {
    const tokens = { requireBusiness: vi.fn(() => { throw new Error('attempt_token_invalid'); }) };
    const actions = { assertBinding: vi.fn() };
    const factory = vi.fn();
    const controller = new AttemptMcpHttpController(
      tokens as never,
      { requireReady: () => ({ runnerInstanceId: 'runner', leaseId }) } as never,
      actions as never,
      { write: vi.fn() } as never,
      factory,
    );

    await expect(controller.mcp(attemptId, {}, mcpRequest('wrong-token') as never, {} as never)).rejects.toThrow('attempt_token_invalid');
    expect(actions.assertBinding).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });
});

function attemptBinding() {
  return {
    attemptId,
    sessionId: 'session-id', taskId: 'task-id', agentVersionId: 'version-id',
    organizationId: 'organization-id', userId: 'user-id', capabilityKeys: ['sourcing.scrapeProductUrl'],
  };
}

function mcpRequest(token: string) {
  return {
    method: 'POST',
    protocol: 'http',
    get: (name: string) => name === 'host' ? '127.0.0.1:4000' : undefined,
    originalUrl: `/internal/agent-runtime/attempts/${attemptId}/mcp`,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    once: vi.fn(),
  };
}
