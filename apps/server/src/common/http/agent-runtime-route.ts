import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';

/** The sole unprefixed internal MCP ingress; no legacy aliases are accepted. */
export const AGENT_RUNTIME_MCP_PATH = '/internal/agent-runtime/mcp';
export const AGENT_RUNTIME_GATEWAY_COMMANDS_POLL_PATH = '/internal/agent-runtime/gateway/commands:poll';
export const AGENT_RUNTIME_GATEWAY_EVENTS_PATH = '/internal/agent-runtime/gateway/events';

const PRIVATE_AGENT_RUNTIME_PATHS = new Set([
  AGENT_RUNTIME_MCP_PATH,
  AGENT_RUNTIME_GATEWAY_COMMANDS_POLL_PATH,
  AGENT_RUNTIME_GATEWAY_EVENTS_PATH,
]);

export function isAgentRuntimeMcpRequest(
  request: Pick<Request, 'originalUrl' | 'url'>,
): boolean {
  const rawUrl = request.originalUrl || request.url || '';
  return rawUrl.split('?', 1)[0] === AGENT_RUNTIME_MCP_PATH;
}

/** Only the exact MCP and Gateway control endpoints bypass browser API composition. */
export function isAgentRuntimePrivateRequest(
  request: Pick<Request, 'originalUrl' | 'url'>,
): boolean {
  const rawUrl = request.originalUrl || request.url || '';
  return PRIVATE_AGENT_RUNTIME_PATHS.has(rawUrl.split('?', 1)[0] ?? '');
}

export function isAgentRuntimeGatewayControlRequest(
  request: Pick<Request, 'originalUrl' | 'url'>,
): boolean {
  const rawUrl = request.originalUrl || request.url || '';
  const path = rawUrl.split('?', 1)[0] ?? '';
  return path === AGENT_RUNTIME_GATEWAY_COMMANDS_POLL_PATH || path === AGENT_RUNTIME_GATEWAY_EVENTS_PATH;
}

/** Keep only the private stateless MCP route outside the browser API prefix. */
export function configureApiGlobalPrefix(
  app: Pick<NestExpressApplication, 'setGlobalPrefix'>,
): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'internal/agent-runtime/mcp', method: RequestMethod.ALL },
      { path: 'internal/agent-runtime/gateway/commands:poll', method: RequestMethod.ALL },
      { path: 'internal/agent-runtime/gateway/events', method: RequestMethod.ALL },
    ],
  });
}
