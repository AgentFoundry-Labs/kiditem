import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { SkipAuth } from '../../../../../auth/decorators/skip-auth.decorator';
import {
  ExecutionBindingRegistry,
} from '../../../out/runtime/gateway/execution-binding.registry';
import {
  KidItemAgentOsMcpServer,
} from '../../mcp/kiditem-agent-os-mcp-server';
import { McpHttpResponseAdapter } from './mcp-http-response.adapter';

export const MCP_WEB_ORIGIN = Symbol('MCP_WEB_ORIGIN');

/**
 * Direct private ingress. Browser-session/RBAC/throttle guards are skipped;
 * this controller still validates the execution bearer before every request.
 */
@SkipAuth()
@SkipThrottle()
@Controller('internal/agent-runtime')
export class AgentMcpHttpController {
  constructor(
    private readonly bindings: ExecutionBindingRegistry,
    private readonly servers: KidItemAgentOsMcpServer,
    private readonly responses: McpHttpResponseAdapter,
    @Inject(MCP_WEB_ORIGIN) private readonly webOrigin: string,
  ) {}

  @Post('mcp')
  async mcp(
    @Body() body: unknown,
    @Req() request: ExpressRequest,
    @Res() response: ExpressResponse,
  ): Promise<void> {
    const binding = this.requireBinding(request);
    const handler = this.servers.createHandler(binding, this.webOrigin);
    const signal = abortSignal(request, response);
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

  private requireBinding(request: Pick<ExpressRequest, 'headers'>) {
    const token = executionBearer(request);
    try {
      return this.bindings.resolve(token ?? '');
    } catch {
      throw new UnauthorizedException('execution_binding_invalid');
    }
  }
}

export function executionBearer(request: Pick<ExpressRequest, 'headers'>): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function abortSignal(request: ExpressRequest, response: ExpressResponse): AbortSignal {
  const abort = new AbortController();
  request.once?.('aborted', () => abort.abort());
  response.once?.('close', () => {
    if (!response.writableEnded) abort.abort();
  });
  return abort.signal;
}

function toFetchRequest(
  request: ExpressRequest,
  body: unknown,
  signal: AbortSignal,
): Request {
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
