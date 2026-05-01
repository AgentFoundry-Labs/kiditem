import { describe, it, expect } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator';

function createCtx(authUser: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ authUser }),
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
  } as unknown as ExecutionContext;
}

function makeReflector(roles: string[] | undefined): Reflector {
  return {
    getAllAndOverride: (key: string) => (key === ROLES_METADATA_KEY ? roles : undefined),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('passes when no @Roles metadata set', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    const ctx = createCtx({ id: 'u', organizationId: 'c', role: 'member', type: 'human', email: 'x@y' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when user role matches required', () => {
    const guard = new RolesGuard(makeReflector(['owner', 'admin']));
    const ctx = createCtx({ id: 'u', organizationId: 'c', role: 'owner', type: 'human', email: 'x@y' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when role not allowed', () => {
    const guard = new RolesGuard(makeReflector(['owner']));
    const ctx = createCtx({ id: 'u', organizationId: 'c', role: 'member', type: 'human', email: 'x@y' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws Unauthorized when authUser missing but @Roles set', () => {
    const guard = new RolesGuard(makeReflector(['owner']));
    const ctx = createCtx(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
