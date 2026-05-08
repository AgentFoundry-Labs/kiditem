import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RewriteRule {
  source: string;
  destination: string;
}

interface NextConfigShape {
  rewrites: () => Promise<RewriteRule[]>;
}

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;

async function getRewrites(): Promise<RewriteRule[]> {
  // next.config.mjs reads NEXT_PUBLIC_API_URL at import time, so reset the
  // module cache before each load to pick up the env override.
  vi.resetModules();
  const mod = (await import('../../next.config.mjs')) as { default: NextConfigShape };
  return mod.default.rewrites();
}

describe('next.config rewrites — chat runtime same-origin transport', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    if (ORIGINAL_API_URL === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
  });

  it('rewrites the exact /api/chat/copilot path to the default backend base', async () => {
    const rules = await getRewrites();

    expect(rules).toEqual(
      expect.arrayContaining([
        { source: '/api/chat/copilot', destination: 'http://localhost:4000/api/chat/copilot' },
      ]),
    );
  });

  it('rewrites the /api/chat/copilot/:path* sub-path with full path forwarding', async () => {
    const rules = await getRewrites();

    expect(rules).toEqual(
      expect.arrayContaining([
        {
          source: '/api/chat/copilot/:path*',
          destination: 'http://localhost:4000/api/chat/copilot/:path*',
        },
      ]),
    );
  });

  it('honours NEXT_PUBLIC_API_URL when set', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.kiditem.local:4001';
    const rules = await getRewrites();

    const destinations = rules.map((r) => r.destination);
    expect(destinations).toContain('http://api.kiditem.local:4001/api/chat/copilot');
    expect(destinations).toContain('http://api.kiditem.local:4001/api/chat/copilot/:path*');
  });

  it('strips a single trailing slash from NEXT_PUBLIC_API_URL', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://api.kiditem.local:4001/';
    const rules = await getRewrites();

    for (const rule of rules) {
      expect(rule.destination).not.toContain('//api/chat');
    }
    expect(rules.map((r) => r.destination)).toContain(
      'http://api.kiditem.local:4001/api/chat/copilot',
    );
  });
});
