import { describe, it, expect } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationScopeGuard } from '../guards/organization-scope.guard';
import { SKIP_AUTH_KEY } from '../decorators/skip-auth.decorator';

function createCtx(
  authUser: unknown,
  meta: Record<string | symbol, unknown> = {},
  authFailureReason?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ authUser, authFailureReason }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getType: () => 'http',
    getHandler: () => (() => undefined) as unknown,
    getClass: () => class {} as unknown,
    getArgs: () => [] as unknown,
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}) as unknown,
    switchToWs: () => ({}) as unknown,
    __meta: meta,
  } as unknown as ExecutionContext;
}

function makeReflector(metaFor: (key: string) => unknown): Reflector {
  return {
    getAllAndOverride: (key: string) => metaFor(key),
  } as unknown as Reflector;
}

describe('OrganizationScopeGuard', () => {
  it('passes when @SkipAuth() metadata is set', () => {
    const guard = new OrganizationScopeGuard(makeReflector((k) => (k === SKIP_AUTH_KEY ? true : undefined)));
    const ctx = createCtx(undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws auth_required when req.authUser missing', () => {
    const guard = new OrganizationScopeGuard(makeReflector(() => undefined));
    const ctx = createCtx(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('auth_required');
    }
  });

  it('throws recorded auth failure reason when req.authUser missing', () => {
    const guard = new OrganizationScopeGuard(makeReflector(() => undefined));
    const ctx = createCtx(undefined, {}, 'auth_user_not_mirrored');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('auth_user_not_mirrored');
    }
  });

  it('throws no_organization_context when organizationId is null', () => {
    const guard = new OrganizationScopeGuard(makeReflector(() => undefined));
    const ctx = createCtx({ id: 'u1', organizationId: null, role: 'system', type: 'system', email: 's@x' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('no_organization_context');
    }
  });

  it('passes when authUser has organizationId', () => {
    const guard = new OrganizationScopeGuard(makeReflector(() => undefined));
    const ctx = createCtx({ id: 'u1', organizationId: 'c1', role: 'owner', type: 'human', email: 'a@b' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('skips guard for non-http contexts', () => {
    const guard = new OrganizationScopeGuard(makeReflector(() => undefined));
    const ctx = {
      ...createCtx(undefined),
      getType: () => 'rpc',
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
