import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentMcpHttpController,
  mcpTransportBearer,
} from '../agent-mcp-http.controller';
import { MCP_CONVERSATION_ID_HEADER } from '@kiditem/shared/agent-runtime';

describe('Agent MCP HTTP controller', () => {
  it('authenticates the process bearer for each request and passes a lazy current-turn resolver scoped by the static conversation header', async () => {
    const active = {
      executionId: 'execution-1',
      installationId: 'installation-1',
      gatewayInstanceId: 'gateway-1',
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    };
    const handler = {
      fetch: vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), {
        headers: { 'content-type': 'application/json' },
      })),
      close: vi.fn(async () => undefined),
    };
    const runtime = {
      authenticate: vi.fn(() => ({ installationId: 'installation-1', gatewayInstanceId: 'gateway-1' })),
      resolveActive: vi.fn(() => active),
    };
    const servers = { createHandler: vi.fn(() => handler) };
    const responses = { write: vi.fn(async () => undefined) };
    const controller = new AgentMcpHttpController(
      runtime as never,
      servers as never,
      responses as never,
    );
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

    await controller.mcp(body, request('process-token', 'conversation-1') as never, response() as never);
    await controller.mcp(body, request('process-token', 'conversation-1') as never, response() as never);

    expect(runtime.authenticate).toHaveBeenCalledTimes(2);
    expect(runtime.authenticate).toHaveBeenNthCalledWith(1, 'process-token');
    expect(servers.createHandler).toHaveBeenCalledTimes(2);
    expect(runtime.resolveActive).not.toHaveBeenCalled();
    const resolveActive = servers.createHandler.mock.calls[0]![0] as () => typeof active;
    expect(resolveActive()).toEqual(active);
    expect(runtime.resolveActive).toHaveBeenCalledWith('process-token', 'conversation-1');
    expect(handler.fetch).toHaveBeenCalledWith(expect.any(Request), { parsedBody: body });
    expect(handler.close).toHaveBeenCalledTimes(2);
  });

  it('fails closed with 401 before handler creation when the process bearer or static conversation header is missing or invalid', async () => {
    const runtime = { authenticate: vi.fn(() => { throw new Error('invalid'); }) };
    const servers = { createHandler: vi.fn() };
    const controller = new AgentMcpHttpController(
      runtime as never,
      servers as never,
      { write: vi.fn() } as never,
    );

    await expect(controller.mcp({}, request(null, 'conversation-1') as never, response() as never))
      .rejects.toMatchObject({
        status: 401,
        response: expect.objectContaining({ message: 'mcp_transport_invalid' }),
      } satisfies Partial<UnauthorizedException>);
    expect(servers.createHandler).not.toHaveBeenCalled();
    await expect(controller.mcp({}, request('process-token', null) as never, response() as never))
      .rejects.toMatchObject({ status: 401 });
    expect(mcpTransportBearer(request('token', 'conversation-1') as never)).toBe('token');
    expect(mcpTransportBearer(request(null, 'conversation-1') as never)).toBeNull();
  });
});

function request(token: string | null, conversationId: string | null) {
  return {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(conversationId ? { [MCP_CONVERSATION_ID_HEADER]: conversationId } : {}),
    },
    get: () => '127.0.0.1:4000',
    originalUrl: '/internal/agent-runtime/mcp',
    protocol: 'http',
    method: 'POST',
    once: vi.fn(),
  };
}

function response() {
  return {
    destroyed: false,
    writableEnded: false,
    once: vi.fn(),
  };
}
