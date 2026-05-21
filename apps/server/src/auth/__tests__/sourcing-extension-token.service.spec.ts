import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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

describe('SourcingExtensionTokenService', () => {
  const originalSecret = process.env.SOURCING_EXTENSION_TOKEN_SECRET;

  beforeEach(() => {
    process.env.SOURCING_EXTENSION_TOKEN_SECRET = 'test-secret-for-sourcing-extension-token';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SOURCING_EXTENSION_TOKEN_SECRET;
    } else {
      process.env.SOURCING_EXTENSION_TOKEN_SECRET = originalSecret;
    }
  });

  it('issues a sourcing-only token that verifies back to the authenticated user context', () => {
    const service = new SourcingExtensionTokenService();
    const issued = service.issue(authUser, {
      now: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(issued.token).toMatch(/^kiditem_sourcing_ext_/);
    expect(issued.expiresAt).toBe('2026-05-21T12:30:00.000Z');

    const claims = service.verify(issued.token, {
      now: new Date('2026-05-21T12:05:00.000Z'),
    });

    expect(claims.scope).toBe('sourcing:extension:ingest');
    expect(claims.sub).toBe('user-1');
    expect(claims.organizationId).toBe('org-1');
  });

  it('rejects expired extension tokens', () => {
    const service = new SourcingExtensionTokenService();
    const issued = service.issue(authUser, {
      now: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(() =>
      service.verify(issued.token, {
        now: new Date('2026-05-21T12:31:00.000Z'),
      }),
    ).toThrow('extension_token_expired');
  });
});
