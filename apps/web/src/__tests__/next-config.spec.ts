import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface RewriteRule {
  source: string;
  destination: string;
}

interface ImageRemotePattern {
  protocol: string;
  hostname: string;
}

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;
const ORIGINAL_GATEWAY_URL = process.env.INTERACTION_GATEWAY_URL;
const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');
const nextConfigUrl = pathToFileURL(resolve(webRoot, 'next.config.mjs')).href;

async function getRewrites(extraEnv: NodeJS.ProcessEnv = {}, phase = 'phase-development-server'): Promise<RewriteRule[]> {
  // Load the config through native Node ESM. Vitest transforms dynamic imports
  // into data: URLs, while Next loads next.config.mjs from a file: URL and the
  // config intentionally derives the monorepo root from import.meta.url.
  const script = [
    `const mod = await import(${JSON.stringify(nextConfigUrl)});`,
    `const config = typeof mod.default === 'function' ? mod.default(${JSON.stringify(phase)}) : mod.default;`,
    'console.log(JSON.stringify(await config.rewrites()));',
  ].join('\n');
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'development', ...extraEnv } },
  );
  return JSON.parse(output) as RewriteRule[];
}

async function getImageRemotePatterns(): Promise<ImageRemotePattern[]> {
  const script = [
    `const mod = await import(${JSON.stringify(nextConfigUrl)});`,
    "const config = typeof mod.default === 'function' ? mod.default('phase-development-server') : mod.default;",
    'console.log(JSON.stringify(config.images?.remotePatterns ?? []));',
  ].join('\n');
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { encoding: 'utf8', env: { ...process.env } },
  );
  return JSON.parse(output) as ImageRemotePattern[];
}

describe('next.config rewrites — chat runtime same-origin transport', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.INTERACTION_GATEWAY_URL;
  });

  afterEach(() => {
    if (ORIGINAL_API_URL === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
    if (ORIGINAL_GATEWAY_URL === undefined) delete process.env.INTERACTION_GATEWAY_URL;
    else process.env.INTERACTION_GATEWAY_URL = ORIGINAL_GATEWAY_URL;
  });

  it('rewrites the exact /api/copilotkit path to the dev-only local gateway', async () => {
    const rules = await getRewrites();

    expect(rules).toEqual(
      expect.arrayContaining([
        { source: '/api/copilotkit', destination: 'http://localhost:4100/api/copilotkit' },
      ]),
    );
  });

  it('rewrites the /api/copilotkit/:path* sub-path with full path forwarding', async () => {
    const rules = await getRewrites();

    expect(rules).toEqual(
      expect.arrayContaining([
        {
          source: '/api/copilotkit/:path*',
          destination: 'http://localhost:4100/api/copilotkit/:path*',
        },
      ]),
    );
  });

  it('honours the server-only INTERACTION_GATEWAY_URL when set', async () => {
    const rules = await getRewrites({ INTERACTION_GATEWAY_URL: 'http://gateway.kiditem.local:4101' });

    const destinations = rules.map((r) => r.destination);
    expect(destinations).toContain('http://gateway.kiditem.local:4101/api/copilotkit');
    expect(destinations).toContain('http://gateway.kiditem.local:4101/api/copilotkit/:path*');
  });

  it('strips a single trailing slash from INTERACTION_GATEWAY_URL', async () => {
    const rules = await getRewrites({ INTERACTION_GATEWAY_URL: 'http://gateway.kiditem.local:4101/' });

    for (const rule of rules) {
      expect(rule.destination).not.toContain('//api/copilotkit');
    }
    expect(rules.map((r) => r.destination)).toContain(
      'http://gateway.kiditem.local:4101/api/copilotkit',
    );
  });

  it('fails fast in production without INTERACTION_GATEWAY_URL', () => {
    expect(() => getRewrites({ NODE_ENV: 'production', INTERACTION_GATEWAY_URL: '' }, 'phase-production-server')).rejects.toThrow();
  });

  it('keeps production builds finite while deferring the required-value check to server startup', async () => {
    const rules = await getRewrites({ NODE_ENV: 'production', INTERACTION_GATEWAY_URL: '' }, 'phase-production-build');
    expect(rules).toContainEqual({
      source: '/api/copilotkit',
      destination: 'http://interaction-gateway.invalid/api/copilotkit',
    });
  });
});

describe('next.config images - 1688 CDN proxying', () => {
  it('allows the Alibaba CDN families returned by 1688 search', async () => {
    await expect(getImageRemotePatterns()).resolves.toEqual([
      { protocol: 'https', hostname: '**.alicdn.com' },
      { protocol: 'https', hostname: '**.tbcdn.cn' },
      { protocol: 'https', hostname: '**.taobaocdn.com' },
    ]);
  });
});
