import { Body, Controller, Inject, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import type {
  AttemptMcpActionsPort,
  AttemptMcpBinding,
} from '../../../../application/port/in/mcp/attempt-mcp-actions.port';
import { ATTEMPT_MCP_ACTIONS_PORT } from '../../../../application/port/in/mcp/attempt-mcp-actions.port';
import { SkipAuth } from '../../../../../auth/decorators/skip-auth.decorator';
import { createKidItemAgentOsMcpServer } from '../../mcp/kiditem-agent-os-mcp-server';
import { AttemptTokenRegistry } from '../../../out/runtime/runner/attempt-token.registry';
import { RunnerLeaseRegistry } from '../../../out/runtime/runner/runner-lease.registry';
import { McpHttpResponseAdapter } from './mcp-http-response.adapter';

export type AttemptMcpHandlerFactory = (
  actions: AttemptMcpActionsPort,
  binding: AttemptMcpBinding,
) => McpHttpHandler;

/**
 * The handler is intentionally constructed per HTTP request.  Keeping its
 * factory explicit lets Nest compose that boundary without turning the MCP
 * server itself into a singleton provider.
 */
export const ATTEMPT_MCP_HANDLER_FACTORY = Symbol('ATTEMPT_MCP_HANDLER_FACTORY');

/** Direct request-scoped MCP v2 ingress. No socket, stdio, session, or relay exists. */
@SkipAuth()
@SkipThrottle()
@Controller('internal/agent-runtime/attempts')
export class AttemptMcpHttpController {
  constructor(
    private readonly tokens: AttemptTokenRegistry,
    private readonly leases: RunnerLeaseRegistry,
    @Inject(ATTEMPT_MCP_ACTIONS_PORT)
    private readonly actions: AttemptMcpActionsPort,
    private readonly responses: McpHttpResponseAdapter,
    @Inject(ATTEMPT_MCP_HANDLER_FACTORY)
    private readonly createHandler: AttemptMcpHandlerFactory = createRequestScopedAttemptMcpHandler,
  ) {}

  @Post(':attemptId/mcp')
  async mcp(
    @Param('attemptId') attemptId: string,
    @Body() body: unknown,
    @Req() request: ExpressRequest,
    @Res() response: ExpressResponse,
  ): Promise<void> {
    const signal = abortSignal(request, response);
    const lease = this.requireLease();
    const binding = this.requireAttemptToken(request, attemptId, lease.leaseId);
    try {
      await this.actions.assertBinding(binding);
    } catch {
      throw new UnauthorizedException('attempt_token_invalid');
    }
    const handler = this.createHandler(this.actions, binding);
    try {
      const result = await handler.fetch(toFetchRequest(request, body, signal), { parsedBody: body });
      await this.responses.write(result, response, signal);
    } catch (error) {
      if (signal.aborted || response.destroyed) return;
      throw error;
    } finally {
      await handler.close();
    }
  }

  private requireLease(): { runnerInstanceId: string; leaseId: string } {
    try {
      return this.leases.requireReady();
    } catch {
      throw new UnauthorizedException('attempt_token_invalid');
    }
  }

  private requireAttemptToken(request: ExpressRequest, attemptId: string, leaseId: string): AttemptMcpBinding {
    const raw = bearer(request);
    try {
      return this.tokens.requireBusiness({ raw: raw ?? '', attemptId, leaseId });
    } catch {
      throw new UnauthorizedException('attempt_token_invalid');
    }
  }
}

export function createRequestScopedAttemptMcpHandler(
  actions: AttemptMcpActionsPort,
  binding: AttemptMcpBinding,
): McpHttpHandler {
  return createMcpHandler((context) => {
    if (context.era !== 'modern') throw new Error('attempt_mcp_legacy_rejected');
    return createKidItemAgentOsMcpServer(actions, binding);
  }, { legacy: 'reject' });
}

function bearer(request: Pick<ExpressRequest, 'headers'>): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function abortSignal(request: ExpressRequest, response: ExpressResponse): AbortSignal {
  const abort = new AbortController();
  request.once?.('aborted', () => abort.abort());
  response.once?.('close', () => { if (!response.writableEnded) abort.abort(); });
  return abort.signal;
}

function toFetchRequest(request: ExpressRequest, body: unknown, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, value);
  }
  const host = request.get('host') ?? '127.0.0.1';
  const url = new URL(request.originalUrl, `${request.protocol}://${host}`);
  return new Request(url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
    signal,
  });
}
