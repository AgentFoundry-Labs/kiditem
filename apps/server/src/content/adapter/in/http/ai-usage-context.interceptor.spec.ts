import { Controller, Get, Injectable, type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiUsageContextInterceptor } from './ai-usage-context.interceptor';
import { aiUsageMeter, type AiUsageEntry } from '../../../application/usage/ai-usage-meter';

@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    ctx.switchToHttp().getRequest().authUser = { organizationId: 'org-1' };
    return true;
  }
}

@Controller()
class ModelCallingController {
  /** A handler that reaches the provider only after awaiting other work. */
  @Get('sourcing/keyword-analysis')
  async analyse(): Promise<{ ok: true }> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    aiUsageMeter.recordGemini({
      model: 'gemini-2.5-flash',
      operation: 'text_completion',
      usage: { promptTokenCount: 10, candidatesTokenCount: 4 },
    });
    return { ok: true };
  }
}

/**
 * The context the interceptor opens has to survive Nest's own pipeline and the
 * handler's awaits, or every request-made call would silently go unmetered.
 */
describe('AiUsageContextInterceptor', () => {
  let app: INestApplication;
  const written: AiUsageEntry[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ModelCallingController],
      providers: [
        { provide: APP_GUARD, useClass: FakeAuthGuard },
        { provide: APP_INTERCEPTOR, useClass: AiUsageContextInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    aiUsageMeter.bind(async (entry) => { written.push(entry); });
  });

  afterAll(async () => {
    aiUsageMeter.bind(null);
    await app.close();
  });

  it("meters a handler's model call to the request's organization and agent", async () => {
    await request(app.getHttpServer()).get('/api/sourcing/keyword-analysis').expect(200);

    expect(written).toEqual([expect.objectContaining({
      organizationId: 'org-1',
      agentKey: 'sourcing',
      inputTokens: 10,
      outputTokens: 4,
    })]);
  });
});
