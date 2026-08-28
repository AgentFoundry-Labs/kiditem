import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { ConversationIdSchema, MCP_CONVERSATION_ID_HEADER } from '@kiditem/shared/agent-runtime';
import { SkipAuth } from '../../../../../auth/decorators/skip-auth.decorator';
import {
  GatewayMcpRuntimeRegistry,
} from '../../../out/runtime/gateway/gateway-mcp-runtime.registry';
import {
  KidItemAgentOsMcpServer,
} from '../../mcp/kiditem-agent-os-mcp-server';
import { McpHttpResponseAdapter } from './mcp-http-response.adapter';

/**
 * Direct private ingress. Browser-session/RBAC/throttle guards are skipped;
 * this controller still validates the process transport bearer before every
 * request. Tool callbacks resolve their active turn only when invoked.
 */
@SkipAuth()
@SkipThrottle()
@Controller('internal/agent-runtime')
export class AgentMcpHttpController {
  constructor(
    private readonly runtime: GatewayMcpRuntimeRegistry,
    private readonly servers: KidItemAgentOsMcpServer,
    private readonly responses: McpHttpResponseAdapter,
  ) {}

  @Post('mcp')
  async mcp(
    @Body() body: unknown,
    @Req() request: ExpressRequest,
    @Res() response: ExpressResponse,
  ): Promise<void> {
    const connection = this.requireConnection(request);
    const handler = this.servers.createHandler(
      () => this.runtime.resolveActive(connection.mcpTransportToken, connection.conversationId),
    );
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

  private requireConnection(request: Pick<ExpressRequest, 'headers'>) {
    const mcpTransportToken = mcpTransportBearer(request);
    const conversationId = mcpConversationId(request);
    if (!mcpTransportToken || !conversationId) throw new UnauthorizedException('mcp_transport_invalid');
    try {
      this.runtime.authenticate(mcpTransportToken);
      return { mcpTransportToken, conversationId };
    } catch {
      throw new UnauthorizedException('mcp_transport_invalid');
    }
  }
}

export function mcpTransportBearer(request: Pick<ExpressRequest, 'headers'>): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

export function mcpConversationId(request: Pick<ExpressRequest, 'headers'>): string | null {
  const value = request.headers[MCP_CONVERSATION_ID_HEADER];
  if (typeof value !== 'string') return null;
  const parsed = ConversationIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
