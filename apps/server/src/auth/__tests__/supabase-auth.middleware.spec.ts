import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';

const TEST_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@kiditem.local',
  role: 'member',
  type: 'human',
  memberships: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      organizationId: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
      status: 'active',
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSelectedAt: null,
    },
  ],
};

const EXPECTED_AUTH_USER = {
  id: TEST_USER.id,
  organizationId: TEST_USER.memberships[0].organizationId,
  membershipId: TEST_USER.memberships[0].id,
  role: TEST_USER.memberships[0].role,
  type: TEST_USER.type,
  email: TEST_USER.email,
};

const expectedFindUserCall = {
  where: { id: TEST_USER.id },
  include: {
    memberships: {
      where: { status: 'active' },
      orderBy: [{ lastSelectedAt: 'desc' }, { joinedAt: 'asc' }],
      take: 1,
    },
  },
};

function makePrisma(findUnique: ReturnType<typeof vi.fn>): PrismaService {
  return { user: { findUnique } } as unknown as PrismaService;
}

// jose 6.x ESM dynamic import → vi.mock 으로 jwtVerify 결과 강제.
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => ({})),
}));

describe('SupabaseAuthMiddleware', () => {
  const ORIGINAL_SUPABASE_URL = process.env.SUPABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
  });

  afterEach(() => {
    if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = ORIGINAL_SUPABASE_URL;
    vi.clearAllMocks();
  });

  it('passes through silently when no Authorization header or sb-access-token cookie', async () => {
    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn();
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = { headers: {} } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('passes through silently when SUPABASE_URL is missing (key not configured)', async () => {
    delete process.env.SUPABASE_URL;
    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn();
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { authorization: 'Bearer abc.def.ghi' } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);
    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('attaches authUser when Bearer token verifies and active membership exists', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockResolvedValue({ payload: { sub: TEST_USER.id } });

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { authorization: 'Bearer valid.jwt.token' } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(findUnique).toHaveBeenCalledWith(expectedFindUserCall);
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads token from sb-access-token cookie when Authorization header missing', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockResolvedValue({ payload: { sub: TEST_USER.id } });

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = {
      headers: {},
      cookies: { 'sb-access-token': 'cookie.jwt.token' },
    } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads access_token from the standard Supabase SSR auth-token cookie', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockResolvedValue({ payload: { sub: TEST_USER.id } });

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = {
      headers: {},
      cookies: {
        'sb-test-auth-token': Buffer.from(
          JSON.stringify({ access_token: 'standard.cookie.jwt' }),
          'utf8',
        ).toString('base64url').replace(/^/, 'base64-'),
      },
    } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(jose.jwtVerify).toHaveBeenCalledWith(
      'standard.cookie.jwt',
      expect.anything(),
      expect.objectContaining({ audience: 'authenticated' }),
    );
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reassembles chunked Supabase SSR auth-token cookies before reading access_token', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockResolvedValue({ payload: { sub: TEST_USER.id } });

    const encoded = `base64-${Buffer.from(
      JSON.stringify({ access_token: 'chunked.cookie.jwt' }),
      'utf8',
    ).toString('base64url')}`;

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn().mockResolvedValue(TEST_USER);
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = {
      headers: {},
      cookies: {
        'sb-test-auth-token.0': encoded.slice(0, 18),
        'sb-test-auth-token.1': encoded.slice(18),
      },
    } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(jose.jwtVerify).toHaveBeenCalledWith(
      'chunked.cookie.jwt',
      expect.anything(),
      expect.objectContaining({ audience: 'authenticated' }),
    );
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(req.authUser).toEqual(EXPECTED_AUTH_USER);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through silently when JWT verify throws (invalid token)', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockRejectedValue(new Error('invalid signature'));

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn();
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { authorization: 'Bearer bad.jwt.token' } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('attaches authUser with organizationId=null when user has no active membership', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockResolvedValue({ payload: { sub: TEST_USER.id } });

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn().mockResolvedValue({ ...TEST_USER, memberships: [] });
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { authorization: 'Bearer valid.jwt.token' } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(req.authUser).toEqual({
      id: TEST_USER.id,
      organizationId: null,
      membershipId: null,
      role: TEST_USER.role,
      type: TEST_USER.type,
      email: TEST_USER.email,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through when local users row does not exist (Supabase user not mirrored yet)', async () => {
    const jose = await import('jose');
    (jose.jwtVerify as any).mockResolvedValue({ payload: { sub: TEST_USER.id } });

    const { SupabaseAuthMiddleware } = await import('../middleware/supabase-auth.middleware');
    const findUnique = vi.fn().mockResolvedValue(null);
    const mw = new SupabaseAuthMiddleware(makePrisma(findUnique));
    const req = { headers: { authorization: 'Bearer valid.jwt.token' } } as any;
    const next = vi.fn();
    await mw.use(req, {} as any, next);

    expect(req.authUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
