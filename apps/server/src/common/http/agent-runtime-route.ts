import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';

/** The sole unprefixed internal MCP ingress; no legacy aliases are accepted. */
export const AGENT_RUNTIME_MCP_PATH = '/internal/agent-runtime/mcp';

export function isAgentRuntimeMcpRequest(
  request: Pick<Request, 'originalUrl' | 'url'>,
): boolean {
  const rawUrl = request.originalUrl || request.url || '';
  return rawUrl.split('?', 1)[0] === AGENT_RUNTIME_MCP_PATH;
}

/** Keep only the private stateless MCP route outside the browser API prefix. */
export function configureApiGlobalPrefix(
  app: Pick<NestExpressApplication, 'setGlobalPrefix'>,
): void {
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'internal/agent-runtime/mcp', method: RequestMethod.ALL }],
  });
}
