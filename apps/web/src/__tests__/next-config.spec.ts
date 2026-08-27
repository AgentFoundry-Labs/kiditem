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

async function getAllowedDevOrigins(): Promise<string[]> {
  const script = [
    `const mod = await import(${JSON.stringify(nextConfigUrl)});`,
    "const config = typeof mod.default === 'function' ? mod.default('phase-development-server') : mod.default;",
    'console.log(JSON.stringify(config.allowedDevOrigins ?? []));',
  ].join('\n');
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'development' } },
  );
  return JSON.parse(output) as string[];
}

describe('next.config rewrites — chat runtime same-origin transport', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    if (ORIGINAL_API_URL === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
  });

  it('rewrites the exact /api/copilotkit path to the ordinary Nest API', async () => {
    const rules = await getRewrites();

    expect(rules).toEqual(
      expect.arrayContaining([
        { source: '/api/copilotkit', destination: 'http://localhost:4000/api/copilotkit' },
      ]),
    );
  });

  it('rewrites the /api/copilotkit/:path* sub-path with full path forwarding', async () => {
    const rules = await getRewrites();

    expect(rules).toEqual(
      expect.arrayContaining([
        {
          source: '/api/copilotkit/:path*',
          destination: 'http://localhost:4000/api/copilotkit/:path*',
        },
      ]),
    );
  });

  it('uses the configured ordinary API base in every Next phase', async () => {
    const rules = await getRewrites({ NEXT_PUBLIC_API_URL: 'https://api.example.test/' }, 'phase-production-server');
    expect(rules).toContainEqual({ source: '/api/copilotkit', destination: 'https://api.example.test/api/copilotkit' });
  });

  it('includes the regular API rewrite only when the build enables the all-API proxy', async () => {
    const rules = await getRewrites({
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4320',
      KIDITEM_PROXY_ALL_API: 'true',
    }, 'phase-production-build');

    expect(rules).toContainEqual({
      source: '/api/:path*',
      destination: 'http://127.0.0.1:4320/api/:path*',
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

describe('next.config development origins', () => {
  it('allows the loopback host used by isolated browser QA without a wildcard', async () => {
    const origins = await getAllowedDevOrigins();

    expect(origins).toContain('127.0.0.1');
    expect(origins).not.toContain('*');
  });
});
