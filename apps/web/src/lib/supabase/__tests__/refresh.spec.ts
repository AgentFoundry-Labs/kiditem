import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      refreshSession,
      signOut,
    },
  })),
}));

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

describe('refresh module', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    refreshSession.mockReset();
    signOut.mockReset();

    const { __resetSupabaseClientForTests } = await import('../client');
    const { __resetRefreshInflightForTests } = await import('../refresh');
    __resetSupabaseClientForTests();
    __resetRefreshInflightForTests();
  });

  afterEach(async () => {
    const { __resetSupabaseClientForTests } = await import('../client');
    const { __resetRefreshInflightForTests } = await import('../refresh');
    __resetSupabaseClientForTests();
    __resetRefreshInflightForTests();
  });

  afterAll(() => {
    if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
    if (ORIGINAL_SUPABASE_PUBLISHABLE_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIGINAL_SUPABASE_PUBLISHABLE_KEY;
    }
  });

  describe('refreshOrFail', () => {
    it('R1: returns true on successful refresh with a session', async () => {
      refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: 'new' } },
        error: null,
      });
      const { refreshOrFail } = await import('../refresh');

      const result = await refreshOrFail();

      expect(result).toBe(true);
      expect(refreshSession).toHaveBeenCalledTimes(1);
    });

    it('R2: returns false when refreshSession returns an error', async () => {
      refreshSession.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Invalid refresh token' },
      });
      const { refreshOrFail } = await import('../refresh');

      const result = await refreshOrFail();

      expect(result).toBe(false);
    });

    it('R3: serializes 5 concurrent callers to a single refresh call (mutex)', async () => {
      let resolveRefresh!: (v: unknown) => void;
      refreshSession.mockImplementationOnce(
        () => new Promise((res) => {
          resolveRefresh = res;
        }),
      );
      const { refreshOrFail } = await import('../refresh');

      const callers = [refreshOrFail(), refreshOrFail(), refreshOrFail(), refreshOrFail(), refreshOrFail()];
      resolveRefresh({ data: { session: { access_token: 'new' } }, error: null });
      const results = await Promise.all(callers);

      expect(results).toEqual([true, true, true, true, true]);
      expect(refreshSession).toHaveBeenCalledTimes(1);
    });

    it('R4: clears mutex after resolution so the next cycle attempts a fresh refresh', async () => {
      refreshSession
        .mockResolvedValueOnce({ data: { session: null }, error: { message: 'fail' } })
        .mockResolvedValueOnce({
          data: { session: { access_token: 'new' } },
          error: null,
        });
      const { refreshOrFail } = await import('../refresh');

      const first = await refreshOrFail();
      const second = await refreshOrFail();

      expect(first).toBe(false);
      expect(second).toBe(true);
      expect(refreshSession).toHaveBeenCalledTimes(2);
    });

    it('R9: returns false when refresh succeeds with null session', async () => {
      refreshSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      const { refreshOrFail } = await import('../refresh');

      expect(await refreshOrFail()).toBe(false);
    });

    it('returns false when refreshSession throws', async () => {
      refreshSession.mockRejectedValueOnce(new Error('network'));
      const { refreshOrFail } = await import('../refresh');

      expect(await refreshOrFail()).toBe(false);
    });
  });

  describe('triggerSignOut + consumeSignOutReason', () => {
    it('R5: triggerSignOut("manual") calls supabase.auth.signOut and consumeSignOutReason returns "manual"', async () => {
      signOut.mockResolvedValueOnce(undefined);
      const { triggerSignOut, consumeSignOutReason } = await import('../refresh');

      await triggerSignOut('manual');

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(consumeSignOutReason()).toBe('manual');
    });

    it('R6: triggerSignOut("session_expired") + consumeSignOutReason returns "session_expired"', async () => {
      signOut.mockResolvedValueOnce(undefined);
      const { triggerSignOut, consumeSignOutReason } = await import('../refresh');

      await triggerSignOut('session_expired');

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(consumeSignOutReason()).toBe('session_expired');
    });

    it('R7: consumeSignOutReason resets to "manual" after read', async () => {
      signOut.mockResolvedValueOnce(undefined);
      const { triggerSignOut, consumeSignOutReason } = await import('../refresh');

      await triggerSignOut('session_expired');
      expect(consumeSignOutReason()).toBe('session_expired');
      expect(consumeSignOutReason()).toBe('manual');
    });

    it('R8: triggerSignOut without args defaults to "manual"', async () => {
      signOut.mockResolvedValueOnce(undefined);
      const { triggerSignOut, consumeSignOutReason } = await import('../refresh');

      await triggerSignOut();

      expect(consumeSignOutReason()).toBe('manual');
    });
  });

  describe('__resetRefreshInflightForTests', () => {
    it('throws outside NODE_ENV=test', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        const { __resetRefreshInflightForTests } = await import('../refresh');
        expect(() => __resetRefreshInflightForTests()).toThrow(/test-only/);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
