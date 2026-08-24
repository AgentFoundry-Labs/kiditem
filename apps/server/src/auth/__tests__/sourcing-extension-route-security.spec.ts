import { RequestMethod } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ApiApplicationModule } from '../../api-application.module';
import { SourcingBrowserTrendOperationController } from '../../sourcing/adapter/in/http/sourcing-browser-trend-operation.controller';
import { SourcingBrowserLiveCommerceOperationController } from '../../sourcing/adapter/in/http/sourcing-browser-live-commerce-operation.controller';
import { SessionAuthMiddleware } from '../middleware/session-auth.middleware';

describe('sourcing extension route security wiring', () => {
  it('blocks the internal Agent command namespace at the Office edge', () => {
    const nginx = readFileSync(
      resolve(__dirname, '../../../../../deploy/office/nginx.conf'),
      'utf8',
    );
    const internalBoundary = nginx.indexOf('location ^~ /internal/');
    const apiProxy = nginx.indexOf('location /api/');
    expect(internalBoundary).toBeGreaterThanOrEqual(0);
    expect(nginx.slice(internalBoundary, apiProxy)).toContain('return 404;');
    expect(internalBoundary).toBeLessThan(apiProxy);
  });

  it('runs the global KidItem session middleware on extension routes', () => {
    const sessionForRoutes = vi.fn();
    const exclude = vi.fn().mockReturnValue({ forRoutes: sessionForRoutes });
    const apply = vi.fn().mockReturnValue({ exclude });

    new ApiApplicationModule().configure({ apply } as never);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(SessionAuthMiddleware);
    expect(exclude).toHaveBeenCalledWith({
      path: 'internal/agent-runtime/*path',
      method: RequestMethod.ALL,
    });
    expect(sessionForRoutes).toHaveBeenCalledWith('*');
  });

  it.each([
    [SourcingBrowserTrendOperationController, 'ingest1688Results', '1688-trends/:runId/results'],
    [SourcingBrowserTrendOperationController, 'ingestTiktokCcResults', 'tiktok-cc-trends/:runId/results'],
    [SourcingBrowserLiveCommerceOperationController, 'ingestResults', 'live-commerce/:runId/results'],
  ])(
    'keeps %s.%s on the globally authenticated sourcing operation route',
    (controller, handlerName, handlerPath) => {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(
        'sourcing/operations',
      );
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          controller.prototype[handlerName as keyof typeof controller.prototype],
        ),
      ).toBe(handlerPath);
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          controller.prototype[handlerName as keyof typeof controller.prototype],
        ),
      ).toBe(RequestMethod.POST);
    },
  );
});
