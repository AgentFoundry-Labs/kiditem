import { createBrowserClient } from '@supabase/ssr';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: {} })),
}));

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORIGINAL_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe('createSupabaseBrowserClient', () => {
  beforeEach(() => {
    vi.mocked(createBrowserClient).mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
});
