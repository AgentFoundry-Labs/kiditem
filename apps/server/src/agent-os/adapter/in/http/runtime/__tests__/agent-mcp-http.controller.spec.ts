import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentMcpHttpController,
  executionBearer,
} from '../agent-mcp-http.controller';

describe('Agent MCP HTTP controller', () => {
  it('resolves the execution bearer fresh for each independent request before creating a stateless handler', async () => {
    const binding = {
      executionId: 'execution-1',
      installationId: 'installation-1',
      organizationId: '00000000-0000-4000-8000-000000000001',
      initiatingUserId: '00000000-0000-4000-8000-000000000002',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      expiresAt: new Date('2026-08-25T04:00:00.000Z'),
    };
    const handler = {
      fetch: vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }), {
        headers: { 'content-type': 'application/json' },
      })),
      close: vi.fn(async () => undefined),
    };
    const bindings = { resolve: vi.fn(() => binding) };
    const servers = { createHandler: vi.fn(() => handler) };
    const responses = { write: vi.fn(async () => undefined) };
    const controller = new AgentMcpHttpController(
      bindings as never,
      servers as never,
      responses as never,
      'https://kiditem.test',
    );
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

    await controller.mcp(body, request('binding-1') as never, response() as never);
    await controller.mcp(body, request('binding-1') as never, response() as never);

    expect(bindings.resolve).toHaveBeenCalledTimes(2);
    expect(bindings.resolve).toHaveBeenNthCalledWith(1, 'binding-1');
    expect(servers.createHandler).toHaveBeenCalledTimes(2);
    expect(handler.fetch).toHaveBeenCalledWith(expect.any(Request), { parsedBody: body });
    expect(handler.close).toHaveBeenCalledTimes(2);
  });

  it('fails closed with 401 before handler creation when the bearer is missing or invalid', async () => {
    const bindings = { resolve: vi.fn(() => { throw new Error('invalid'); }) };
    const servers = { createHandler: vi.fn() };
    const controller = new AgentMcpHttpController(
      bindings as never,
      servers as never,
      { write: vi.fn() } as never,
      'https://kiditem.test',
    );

    await expect(controller.mcp({}, request(null) as never, response() as never))
      .rejects.toMatchObject({
        status: 401,
        response: expect.objectContaining({ message: 'execution_binding_invalid' }),
      } satisfies Partial<UnauthorizedException>);
    expect(servers.createHandler).not.toHaveBeenCalled();
    expect(executionBearer(request('token') as never)).toBe('token');
    expect(executionBearer(request(null) as never)).toBeNull();
  });
});

function request(token: string | null) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
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
