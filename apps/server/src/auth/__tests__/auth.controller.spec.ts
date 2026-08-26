import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import { AUTH_SESSION_COOKIE, type AuthService } from '../application/auth.service';
import type { AuthUser } from '../auth.types';

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const AUTH_USER: AuthUser = {
  id: USER_ID,
  organizationId: ORG_ID,
  membershipId: MEMBERSHIP_ID,
  role: 'owner',
  type: 'human',
  email: 'test@kiditem.local',
};

function makeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    login: vi.fn(),
    authenticateToken: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

describe('AuthController.me', () => {
  it('returns AuthUserPublic merged from req.authUser + users row', async () => {
    const currentUser = {
      id: USER_ID,
      email: 'test@kiditem.local',
      name: 'Test User',
      type: 'human',
      role: 'owner',
      organizationId: ORG_ID,
      membershipId: MEMBERSHIP_ID,
    };
    const getCurrentUser = vi.fn().mockResolvedValue(currentUser);
    const ctrl = new AuthController(makeAuthService({ getCurrentUser } as Partial<AuthService>));

    const result = await ctrl.me(AUTH_USER);

    expect(getCurrentUser).toHaveBeenCalledWith(AUTH_USER);
    expect(result).toEqual(currentUser);
  });

  it('returns AuthUserPublic with null organization for system/unassigned user', async () => {
    const currentUser = {
      id: USER_ID,
      email: 'system@kiditem.local',
      name: 'System',
      type: 'human',
      role: 'member',
      organizationId: null,
      membershipId: null,
    };
    const ctrl = new AuthController(makeAuthService({
      getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    } as Partial<AuthService>));
    const systemAuthUser: AuthUser = {
      ...AUTH_USER,
      organizationId: null,
      membershipId: null,
      role: 'member',
    };

    const result = await ctrl.me(systemAuthUser);

    expect(result.organizationId).toBeNull();
    expect(result.membershipId).toBeNull();
  });

});

describe('AuthController session endpoints', () => {
  it('sets the HttpOnly session cookie without returning its raw token to browser code', async () => {
    const result = {
      session: { token: 'a'.repeat(43), expiresAt: '2026-08-29T03:00:00.000Z' },
      user: {
        ...AUTH_USER,
        name: 'Test User',
      },
    };
    const login = vi.fn().mockResolvedValue(result);
    const controller = new AuthController(makeAuthService({ login } as Partial<AuthService>));
    const response = { cookie: vi.fn() } as any;

    await expect(
      controller.login(
        { email: 'test@kiditem.local', password: 'correct password' },
        response,
      ),
    ).resolves.toEqual({ user: result.user });
    expect(response.cookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE,
      result.session.token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1_000,
      }),
    );
  });

  it('returns the cookie token only through an explicit authenticated extension handoff', async () => {
    const token = 'a'.repeat(43);
    const authenticateToken = vi.fn().mockResolvedValue({
      sessionId: 'session-id',
      authUser: AUTH_USER,
    });
    const controller = new AuthController(makeAuthService({
      authenticateToken,
    } as Partial<AuthService>));

    await expect(
      controller.extensionHandoff(
        AUTH_USER,
        {
          authSessionId: 'session-id',
          cookies: { [AUTH_SESSION_COOKIE]: token },
        } as any,
      ),
    ).resolves.toEqual({ token });
    expect(authenticateToken).toHaveBeenCalledWith(token);
  });

  it('rejects extension handoff without the authenticated browser cookie', async () => {
    const controller = new AuthController(makeAuthService());

    await expect(
      controller.extensionHandoff(AUTH_USER, { cookies: {} } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects extension handoff when the cookie does not match the middleware session', async () => {
    const controller = new AuthController(makeAuthService({
      authenticateToken: vi.fn().mockResolvedValue({
        sessionId: 'different-session-id',
        authUser: AUTH_USER,
      }),
    } as Partial<AuthService>));

    await expect(
      controller.extensionHandoff(
        AUTH_USER,
        {
          authSessionId: 'session-id',
          cookies: { [AUTH_SESSION_COOKIE]: 'a'.repeat(43) },
        } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes only the current session and clears its cookie on logout', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const controller = new AuthController(makeAuthService({ logout } as Partial<AuthService>));
    const response = { clearCookie: vi.fn() } as any;

    await controller.logout(
      AUTH_USER,
      { authSessionId: 'session-id' } as any,
      response,
    );

    expect(logout).toHaveBeenCalledWith('session-id', USER_ID);
    expect(response.clearCookie).toHaveBeenCalledWith(
      AUTH_SESSION_COOKIE,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('rejects logout when the middleware session identity is missing', async () => {
    const controller = new AuthController(makeAuthService());

    await expect(
      controller.logout(AUTH_USER, {} as any, { clearCookie: vi.fn() } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
