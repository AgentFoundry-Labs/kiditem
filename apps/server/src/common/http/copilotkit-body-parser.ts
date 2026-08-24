import { json, type Request } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";

const COPILOTKIT_PREFIX = "/api/copilotkit";
const INTERNAL_AGENT_RUNTIME_PREFIX = '/internal/agent-runtime';

/**
 * Install the public interaction route's smaller parser before the normal API
 * parser. The global parser explicitly skips this mounted path so Express does
 * not re-parse a body that has already been bounded and materialized.
 */
export function configureCopilotKitBodyParser(app: NestExpressApplication): void {
  app.use(INTERNAL_AGENT_RUNTIME_PREFIX, json({ limit: '512kb', strict: true }));
  app.use(COPILOTKIT_PREFIX, json({ limit: "1mb", strict: true }));
  app.use(json({
    limit: "25mb",
    strict: true,
    type: (request: Request) => !isScopedJsonRoute(request),
  }));
}

function isScopedJsonRoute(request: Request): boolean {
  const path = request.originalUrl?.split("?")[0] ?? request.url;
  return isPrefix(path, COPILOTKIT_PREFIX) || isPrefix(path, INTERNAL_AGENT_RUNTIME_PREFIX);
}

function isPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
