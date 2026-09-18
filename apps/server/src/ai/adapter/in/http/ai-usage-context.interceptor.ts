import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { agentForApiPath } from '../../../domain/ai-usage';
import { aiUsageMeter } from '../../../application/usage/ai-usage-meter';

/**
 * Opens the AI usage context for an authenticated request: the organization
 * from the auth guard, and the agent the endpoint belongs to. Model calls made
 * while serving the request — including work it starts and awaits — are
 * metered against both.
 */
@Injectable()
export class AiUsageContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    if (ctx.getType() === 'http') {
      const request = ctx.switchToHttp().getRequest<Request>();
      const organizationId = request.authUser?.organizationId;
      // The request's own async chain carries the context from here on; the
      // handler, and anything it awaits, runs inside it.
      if (organizationId) {
        aiUsageMeter.enter({
          organizationId,
          agentKey: agentForApiPath(request.originalUrl ?? request.url),
        });
      }
    }
    return next.handle();
  }
}
