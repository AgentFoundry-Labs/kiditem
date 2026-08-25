import { json, type Request } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { isAgentRuntimeMcpRequest } from './agent-runtime-route';

export const AGENT_RUNTIME_MCP_JSON_LIMIT = '512kb';
export const API_JSON_LIMIT = '25mb';

/**
 * `bodyParser: false` is deliberate in main so this is the one explicit JSON
 * parser composition. The private MCP route is handled first and ordinary
 * `/api` JSON never reparses it.
 */
export function configureAgentRuntimeBodyParsers(
  app: Pick<NestExpressApplication, 'use'>,
): void {
  app.use('/internal/agent-runtime/mcp', json({
    limit: AGENT_RUNTIME_MCP_JSON_LIMIT,
    strict: true,
    type: isMcpJsonRequest,
  }));
  app.use(json({
    limit: API_JSON_LIMIT,
    strict: true,
    type: isOrdinaryApiJsonRequest,
  }));
}

export function isMcpJsonRequest(request: Request): boolean {
  return isAgentRuntimeMcpRequest(request) && hasJsonContentType(request);
}

export function isOrdinaryApiJsonRequest(request: Request): boolean {
  return !isAgentRuntimeMcpRequest(request)
    && request.path.startsWith('/api')
    && hasJsonContentType(request);
}

function hasJsonContentType(request: Pick<Request, 'headers'>): boolean {
  const contentType = request.headers['content-type'];
  return typeof contentType === 'string'
    && /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(contentType);
}
