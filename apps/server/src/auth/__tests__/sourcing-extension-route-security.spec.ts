import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ApiApplicationModule } from '../../api-application.module';
import { SourcingBrowserSourceAttemptController } from '../../sourcing/adapter/in/http/sourcing-browser-source-attempt.controller';
import { SourcingLiveCommerceSourceAttemptController } from '../../sourcing/adapter/in/http/sourcing-live-commerce-source-attempt.controller';
import { SourcingTiktokSourceAttemptController } from '../../sourcing/adapter/in/http/sourcing-tiktok-source-attempt.controller';
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
    const apply = vi.fn().mockReturnValue({ forRoutes: sessionForRoutes });

    new ApiApplicationModule().configure({ apply } as never);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(SessionAuthMiddleware);
    expect(sessionForRoutes).toHaveBeenCalledWith('*');
  });

  it.each([
    [SourcingLiveCommerceSourceAttemptController, 'sourcing/live-commerce', SourcingLiveCommerceSourceAttemptController.prototype.completeBrowser, 'browser/attempts/:attemptId'],
    [SourcingTiktokSourceAttemptController, 'sourcing/tiktok-creative', SourcingTiktokSourceAttemptController.prototype.completeTiktok, 'attempts/:attemptId'],
  ])(
    'keeps %s terminal ingress on its globally authenticated source-owner route',
    (controller, controllerPath, handler, handlerPath) => {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(controllerPath);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(handlerPath);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PUT);
    },
  );

  it.each([
    [SourcingBrowserSourceAttemptController, 'sourcing', 'begin1688', '1688-trends/attempts'],
    [SourcingBrowserSourceAttemptController, 'sourcing', 'complete1688', '1688-trends/attempts/:attemptId'],
    [SourcingBrowserSourceAttemptController, 'sourcing', 'fail1688', '1688-trends/attempts/:attemptId/fail'],
  ] as const)(
    'keeps direct source-owner %s.%s on the globally authenticated sourcing route',
    (controller, controllerPath, handlerName, handlerPath) => {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(controllerPath);
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          controller.prototype[handlerName],
        ),
      ).toBe(handlerPath);
    },
  );

  it('registers retained collectors through source owners without a second Live Operation route', () => {
    const sourcingModule = readFileSync(
      resolve(__dirname, '../../sourcing/sourcing.module.ts'),
      'utf8',
    );
    expect(sourcingModule).toContain('SourcingBrowserSourceAttemptController');
    expect(sourcingModule).toContain('SourcingTiktokSourceAttemptController');
    expect(sourcingModule).toContain('SourcingLiveCommerceSourceAttemptController');
    expect(sourcingModule).not.toContain('SourcingBrowserLiveCommerceOperation');
  });
});
