import { RequestMethod } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ApiApplicationModule } from '../../api-application.module';
import { Sourcing1688TrendExtensionController } from '../../sourcing/adapter/in/http/sourcing-1688-trend-extension.controller';
import { SourcingLiveCommerceExtensionController } from '../../sourcing/adapter/in/http/sourcing-live-commerce-extension.controller';
import { SessionAuthMiddleware } from '../middleware/session-auth.middleware';

describe('sourcing extension route security wiring', () => {
  it('blocks the internal Agent command namespace at the Office edge', () => {
    const nginx = readFileSync(
      resolve(__dirname, '../../../../../deploy/office/nginx.conf'),
      'utf8',
    );
    const internalBoundary = nginx.indexOf('location ^~ /api/internal/');
    const apiProxy = nginx.indexOf('location /api/');
    expect(internalBoundary).toBeGreaterThanOrEqual(0);
    expect(nginx.slice(internalBoundary, apiProxy)).toContain('return 404;');
    expect(internalBoundary).toBeLessThan(apiProxy);
  });

  it('runs the global KidItem session middleware on extension routes', () => {
    const sessionForRoutes = vi.fn();
    const apply = vi.fn().mockReturnValue({ forRoutes: sessionForRoutes });

    new ApiApplicationModule().configure({ apply } as never);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(SessionAuthMiddleware);
    expect(sessionForRoutes).toHaveBeenCalledWith('*');
  });

  it.each([
    [Sourcing1688TrendExtensionController, 'ingest1688Results', '1688-results'],
    [SourcingLiveCommerceExtensionController, 'ingest', 'live-commerce-results'],
  ])(
    'keeps %s.%s on the globally authenticated sourcing trend route',
    (controller, handlerName, handlerPath) => {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(
        'sourcing/extension/trend',
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
