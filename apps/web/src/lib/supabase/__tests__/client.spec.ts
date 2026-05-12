import { createBrowserClient } from '@supabase/ssr';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: {}, __id: Math.random() })),
}));

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORIGINAL_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe('createSupabaseBrowserClient', () => {
  beforeEach(async () => {
    vi.mocked(createBrowserClient).mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // 싱글톤은 globalThis 에 저장되므로 test 간 명시적 리셋이 필요하다.
    const { __resetSupabaseClientForTests } = await import('../client');
    __resetSupabaseClientForTests();
  });

  afterEach(async () => {
    const { __resetSupabaseClientForTests } = await import('../client');
    __resetSupabaseClientForTests();
  });

  afterAll(() => {
    if (ORIGINAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;

    if (ORIGINAL_SUPABASE_PUBLISHABLE_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ORIGINAL_SUPABASE_PUBLISHABLE_KEY;
    }

    if (ORIGINAL_SUPABASE_ANON_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_SUPABASE_ANON_KEY;
  });

  it('creates the browser client with the publishable key', async () => {
    const { createSupabaseBrowserClient } = await import('../client');

    createSupabaseBrowserClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'sb_publishable_test',
    );
  });

  it('fails closed when only the legacy anon key is configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'legacy-anon-key';
    const { createSupabaseBrowserClient } = await import('../client');

    expect(() => createSupabaseBrowserClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL \/ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('returns the same instance on subsequent calls (singleton in browser)', async () => {
    const { createSupabaseBrowserClient } = await import('../client');

    const first = createSupabaseBrowserClient();
    const second = createSupabaseBrowserClient();
    const third = createSupabaseBrowserClient();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
  });

  it('returns a fresh instance after __resetSupabaseClientForTests', async () => {
    const { createSupabaseBrowserClient, __resetSupabaseClientForTests } = await import(
      '../client'
    );

    const first = createSupabaseBrowserClient();
    __resetSupabaseClientForTests();
    const second = createSupabaseBrowserClient();

    expect(first).not.toBe(second);
    expect(createBrowserClient).toHaveBeenCalledTimes(2);
  });

  it('__resetSupabaseClientForTests throws outside NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const { __resetSupabaseClientForTests } = await import('../client');
      expect(() => __resetSupabaseClientForTests()).toThrow(/test-only/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
