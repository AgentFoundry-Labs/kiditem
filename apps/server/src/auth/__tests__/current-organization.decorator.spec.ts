import { describe, it, expect } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { currentOrganizationFactory } from '../decorators/current-organization.decorator';
import { currentUserFactory } from '../decorators/current-user.decorator';

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

describe('currentOrganizationFactory', () => {
  it('returns organizationId when authUser has one', () => {
    const ctx = createCtx({ id: 'u1', organizationId: 'c1', role: 'owner', type: 'human', email: 'a@b.c' });
    expect(currentOrganizationFactory(ctx)).toBe('c1');
  });

  it('throws UnauthorizedException("auth_required") when authUser is missing', () => {
    const ctx = createCtx(undefined);
    expect(() => currentOrganizationFactory(ctx)).toThrow(UnauthorizedException);
    try {
      currentOrganizationFactory(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('auth_required');
    }
  });

  it('throws UnauthorizedException("no_organization_context") when organizationId is null', () => {
    const ctx = createCtx({ id: 'u1', organizationId: null, role: 'system', type: 'system', email: 'sys@x' });
    expect(() => currentOrganizationFactory(ctx)).toThrow(UnauthorizedException);
    try {
      currentOrganizationFactory(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('no_organization_context');
    }
  });
});

describe('currentUserFactory', () => {
  it('returns authUser when present', () => {
    const user = { id: 'u1', organizationId: 'c1', role: 'owner', type: 'human', email: 'a@b.c' };
    const ctx = createCtx(user);
    expect(currentUserFactory(ctx)).toEqual(user);
  });

  it('throws when authUser missing', () => {
    const ctx = createCtx(undefined);
    expect(() => currentUserFactory(ctx)).toThrow(UnauthorizedException);
  });
});
