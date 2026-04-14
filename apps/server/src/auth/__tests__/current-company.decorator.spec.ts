import { describe, it, expect } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { currentCompanyFactory } from '../decorators/current-company.decorator';
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

describe('currentCompanyFactory', () => {
  it('returns companyId when authUser has one', () => {
    const ctx = createCtx({ id: 'u1', companyId: 'c1', role: 'owner', type: 'human', email: 'a@b.c' });
    expect(currentCompanyFactory(ctx)).toBe('c1');
  });

  it('throws UnauthorizedException("auth_required") when authUser is missing', () => {
    const ctx = createCtx(undefined);
    expect(() => currentCompanyFactory(ctx)).toThrow(UnauthorizedException);
    try {
      currentCompanyFactory(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('auth_required');
    }
  });

  it('throws UnauthorizedException("no_company_context") when companyId is null', () => {
    const ctx = createCtx({ id: 'u1', companyId: null, role: 'system', type: 'system', email: 'sys@x' });
    expect(() => currentCompanyFactory(ctx)).toThrow(UnauthorizedException);
    try {
      currentCompanyFactory(ctx);
    } catch (e) {
      expect((e as UnauthorizedException).message).toContain('no_company_context');
    }
  });
});

describe('currentUserFactory', () => {
  it('returns authUser when present', () => {
    const user = { id: 'u1', companyId: 'c1', role: 'owner', type: 'human', email: 'a@b.c' };
    const ctx = createCtx(user);
    expect(currentUserFactory(ctx)).toEqual(user);
  });

  it('throws when authUser missing', () => {
    const ctx = createCtx(undefined);
    expect(() => currentUserFactory(ctx)).toThrow(UnauthorizedException);
  });
});
