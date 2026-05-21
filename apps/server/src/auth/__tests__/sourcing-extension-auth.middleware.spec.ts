import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { SourcingExtensionAuthMiddleware } from '../middleware/sourcing-extension-auth.middleware';
import { SourcingExtensionTokenService } from '../sourcing-extension-token.service';
import type { AuthUser } from '../auth.types';

const authUser: AuthUser = {
  id: 'user-1',
  organizationId: 'org-1',
  membershipId: 'membership-1',
  role: 'operator',
  type: 'human',
  email: 'user@example.com',
};

describe('SourcingExtensionAuthMiddleware', () => {
  const originalSecret = process.env.SOURCING_EXTENSION_TOKEN_SECRET;

  beforeEach(() => {
    process.env.SOURCING_EXTENSION_TOKEN_SECRET = 'test-secret-for-sourcing-extension-token';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:05:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret === undefined) {
      delete process.env.SOURCING_EXTENSION_TOKEN_SECRET;
    } else {
      process.env.SOURCING_EXTENSION_TOKEN_SECRET = originalSecret;
    }
  });

  it('attaches AuthUser only from a valid sourcing extension token', async () => {
    const service = new SourcingExtensionTokenService();
    const middleware = new SourcingExtensionAuthMiddleware(service);
    const issued = service.issue(authUser, {
      now: new Date('2026-05-21T12:00:00.000Z'),
    });
    const req = {
      headers: { authorization: `Bearer ${issued.token}` },
    } as any;
    const next = vi.fn();

    await middleware.use(req, {} as never, next);

    expect(req.authUser).toMatchObject({
      id: 'user-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
    });
    expect(req.sourcingExtensionToken?.scope).toBe('sourcing:extension:ingest');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves non-extension bearer tokens for Supabase auth middleware', async () => {
    const middleware = new SourcingExtensionAuthMiddleware(new SourcingExtensionTokenService());
    const req = { headers: { authorization: 'Bearer supabase.jwt.token' } } as any;
    const next = vi.fn();

    await middleware.use(req, {} as never, next);

    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
