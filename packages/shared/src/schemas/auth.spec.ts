import { describe, expect, it } from 'vitest';
import { LoginRequestSchema, LoginResponseSchema } from './auth.js';

const authUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'operator@example.com',
  name: 'Office Operator',
  role: 'admin',
  type: 'human',
  organizationId: '22222222-2222-4222-8222-222222222222',
  membershipId: '33333333-3333-4333-8333-333333333333',
};

describe('Office local auth contracts', () => {
  it('accepts any non-empty password without a minimum length rule', () => {
    expect(
      LoginRequestSchema.parse({
        email: '  OPERATOR@Example.com ',
        password: '1',
      }),
    ).toEqual({
      email: 'operator@example.com',
      password: '1',
    });

    expect(() =>
      LoginRequestSchema.parse({ email: 'operator@example.com', password: '' }),
    ).toThrow();
    expect(() =>
      LoginRequestSchema.parse({ email: 'operator@example.com', password: 'x'.repeat(129) }),
    ).toThrow();
  });

  it('parses an opaque session token and ISO expiry in the login response', () => {
    const result = LoginResponseSchema.parse({
      session: {
        token: 'a'.repeat(43),
        expiresAt: '2026-08-29T03:00:00.000Z',
      },
      user: authUser,
    });

    expect(result.session.token).toHaveLength(43);
    expect(result.user.organizationId).toBe(authUser.organizationId);
  });
});
