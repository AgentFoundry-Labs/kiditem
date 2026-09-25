import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ApiApplicationModule } from '../../api-application.module';
import { OperationsController } from '../../common/operation/adapter/in/web/operations.controller';
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

  // 확장 구동 소싱 수집은 실행 계약의 전역 인증 라우트 하나로 들어온다(KID-360).
  it('keeps extension collection ingress on the globally authenticated operation contract routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OperationsController)).toBe('operations');
    expect(Reflect.getMetadata(METHOD_METADATA, OperationsController.prototype.begin)).toBe(RequestMethod.POST);
  });

  it('registers extension collectors as operation owners without a per-source attempt route', () => {
    const sourcingModule = readFileSync(
      resolve(__dirname, '../../sourcing/sourcing.module.ts'),
      'utf8',
    );
    expect(sourcingModule).toContain('SOURCING_EXTENSION_OPERATION_OWNERS');
    expect(sourcingModule).not.toContain('SourcingBrowserSourceAttemptController');
    expect(sourcingModule).not.toContain('SourcingTiktokSourceAttemptController');
    expect(sourcingModule).not.toContain('SourcingLiveCommerceSourceAttemptController');
    expect(sourcingModule).not.toContain('SourcingBrowserLiveCommerceOperation');
  });
});
