import { json, type Request } from "express";
import type { NestExpressApplication } from "@nestjs/platform-express";

const COPILOTKIT_PREFIX = "/api/copilotkit";

/**
 * Install the public interaction route's smaller parser before the normal API
 * parser. The global parser explicitly skips this mounted path so Express does
 * not re-parse a body that has already been bounded and materialized.
 */
export function configureCopilotKitBodyParser(app: NestExpressApplication): void {
  app.use(COPILOTKIT_PREFIX, json({ limit: "1mb", strict: true }));
  app.use(json({
    limit: "25mb",
    strict: true,
    type: (request: Request) => !isCopilotKitRoute(request),
  }));
}

function isCopilotKitRoute(request: Request): boolean {
  const path = request.originalUrl?.split("?")[0] ?? request.url;
  return path === COPILOTKIT_PREFIX || path.startsWith(`${COPILOTKIT_PREFIX}/`);
}
