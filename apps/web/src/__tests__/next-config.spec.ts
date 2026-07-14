import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface RewriteRule {
  source: string;
  destination: string;
}

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;
const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');
const nextConfigUrl = pathToFileURL(resolve(webRoot, 'next.config.mjs')).href;

async function getRewrites(): Promise<RewriteRule[]> {
  // Load the config through native Node ESM. Vitest transforms dynamic imports
  // into data: URLs, while Next loads next.config.mjs from a file: URL and the
  // config intentionally derives the monorepo root from import.meta.url.
  const script = [
    `const mod = await import(${JSON.stringify(nextConfigUrl)});`,
    'console.log(JSON.stringify(await mod.default.rewrites()));',
  ].join('\n');
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { encoding: 'utf8', env: { ...process.env } },
  );
  return JSON.parse(output) as RewriteRule[];
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
