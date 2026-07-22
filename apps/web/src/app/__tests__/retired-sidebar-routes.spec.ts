import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { menuSections } from '@/components/layout/sidebar-menu';

const webRoot = resolve(import.meta.dirname, '../../..');
const expectedSrcAppRoot = resolve(webRoot, 'src/app');
const defaultPageExtensions = ['tsx', 'ts', 'jsx', 'js'] as const;
const requireFromWeb = createRequire(join(webRoot, 'package.json'));
const nextConfigLoaderPath = requireFromWeb.resolve('next/dist/server/config');
const nextConstantsPath = requireFromWeb.resolve('next/constants');
const nextConfigResultSentinel = '__KIDITEM_NEXT_CONFIG_RESULT__';

function resolveEffectiveAppRoot(projectRoot: string): string {
  const rootApp = resolve(projectRoot, 'app');
  if (existsSync(rootApp)) return rootApp;

  const srcApp = resolve(projectRoot, 'src/app');
  if (existsSync(srcApp)) return srcApp;

  throw new Error(`No Next App Router root found under ${projectRoot}`);
}

function pageExtensionsForNextProjectRoot(
  projectRoot: string,
  childEnv: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const script = [
    `const loadConfig = require(${JSON.stringify(nextConfigLoaderPath)}).default;`,
    `const { PHASE_PRODUCTION_BUILD } = require(${JSON.stringify(nextConstantsPath)});`,
    '(async () => {',
    '  const config = await loadConfig(',
    '    PHASE_PRODUCTION_BUILD,',
    '    process.argv[1],',
    '    { silent: true },',
    '  );',
    `  process.stdout.write(${JSON.stringify(`\n${nextConfigResultSentinel}`)} + JSON.stringify({ configFileName: config.configFileName, pageExtensions: config.pageExtensions }) + ${JSON.stringify('\n')});`,
    '})().catch((error) => {',
    '  console.error(error?.stack ?? error);',
    '  process.exit(1);',
    '});',
  ].join('\n');
  const nextChildEnv = { ...childEnv, NODE_ENV: 'production' };
  delete nextChildEnv.__NEXT_PRIVATE_STANDALONE_CONFIG;
  delete nextChildEnv.__NEXT_TEST_MODE;
  delete nextChildEnv.__NEXT_PROCESSED_ENV;
  delete nextChildEnv.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED;
  const output = execFileSync(
    process.execPath,
    ['--eval', script, projectRoot],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: nextChildEnv,
      timeout: 30_000,
    },
  );
  const resultIndex = output.lastIndexOf(nextConfigResultSentinel);
  if (resultIndex < 0) {
    throw new Error('Next loadConfig returned no retired route scanner result');
  }
  const loaded = JSON.parse(
    output.slice(resultIndex + nextConfigResultSentinel.length).trim(),
  ) as { configFileName: string; pageExtensions: unknown };
  const effectivePageExtensions = loaded.pageExtensions;
  const unsupportedPageExtensions = (
    `${loaded.configFileName} resolved custom pageExtensions `
    + `${JSON.stringify(effectivePageExtensions)}; update the retired route scanner first`
  );
  if (!Array.isArray(effectivePageExtensions)
      || effectivePageExtensions.some((extension) => typeof extension !== 'string')) {
    throw new Error(unsupportedPageExtensions);
  }
  const extensions = effectivePageExtensions as string[];
  const extensionSet = new Set(extensions);
  const usesScannerDefaults = extensions.length === defaultPageExtensions.length
    && extensionSet.size === defaultPageExtensions.length
    && defaultPageExtensions.every((extension) => extensionSet.has(extension));
  if (!usesScannerDefaults) {
    throw new Error(unsupportedPageExtensions);
  }
  return extensions;
}

const appRoot = resolveEffectiveAppRoot(webRoot);
const appPageExtensions = pageExtensionsForNextProjectRoot(webRoot);
const retiredSidebarRoutes = [
  '/outbound',
  '/unshipped-items',
  '/warehouses',
  '/order-hub',
  '/cs-management',
  '/order-status-hub',
  '/returns',
  '/return-scan',
] as const;
interface AppPageEntrypoint { href: string; relativePath: string; }

const interceptionMarkers = [
  { marker: '(..)(..)', parentLevels: 2, resetToRoot: false },
  { marker: '(...)', parentLevels: 0, resetToRoot: true },
  { marker: '(..)', parentLevels: 1, resetToRoot: false },
  { marker: '(.)', parentLevels: 0, resetToRoot: false },
] as const;

function parseInterceptedRouteSegment(segment: string): {
  targetSegment: string;
  parentLevels: number;
  resetToRoot: boolean;
} | null {
  const interception = interceptionMarkers.find(({ marker }) => segment.startsWith(marker));
  if (!interception) return null;

  const targetSegment = segment.slice(interception.marker.length);
  if (!targetSegment) {
    throw new Error(`Unsupported interception marker in route segment: ${segment}`);
  }

  return {
    targetSegment,
    parentLevels: interception.parentLevels,
    resetToRoot: interception.resetToRoot,
  };
}

function appRouteSegmentsToHref(routeSegments: string[]): string | null {
  const publicSegments: string[] = [];

  for (const segment of routeSegments) {
    if (segment.startsWith('_')) return null;
    if (segment.startsWith('@')) continue;

    const interception = parseInterceptedRouteSegment(segment);
    if (!interception) {
      if (segment.startsWith('(') && segment.endsWith(')')) continue;
      publicSegments.push(segment);
      continue;
    }

    if (interception.resetToRoot) {
      publicSegments.length = 0;
    } else if (interception.parentLevels > publicSegments.length) {
      throw new Error(`Intercepted route climbs above the route root: ${segment}`);
    } else if (interception.parentLevels > 0) {
      publicSegments.splice(publicSegments.length - interception.parentLevels);
    }

    publicSegments.push(interception.targetSegment);
  }

  return publicSegments.length === 0 ? '/' : `/${publicSegments.join('/')}`;
}

function routePatternCanMatchRouteOrDescendant(pattern: string, route: string): boolean {
  const patternSegments = hrefPathname(pattern).split('/').filter(Boolean);
  const routeSegments = hrefPathname(route).split('/').filter(Boolean);
  const visited = new Set<string>();

  function canMatch(patternIndex: number, routeIndex: number): boolean {
    if (routeIndex === routeSegments.length) return true;
    if (patternIndex === patternSegments.length) return false;

    const state = `${patternIndex}:${routeIndex}`;
    if (visited.has(state)) return false;
    visited.add(state);

    const segment = patternSegments[patternIndex];
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) {
      return canMatch(patternIndex + 1, routeIndex)
        || canMatch(patternIndex, routeIndex + 1);
    }
    if (/^\[\.\.\.[^\]]+\]$/.test(segment)) {
      return canMatch(patternIndex + 1, routeIndex + 1)
        || canMatch(patternIndex, routeIndex + 1);
    }
    if (/^\[[^\]]+\]$/.test(segment)) {
      return canMatch(patternIndex + 1, routeIndex + 1);
    }
    if (segment !== routeSegments[routeIndex]) return false;
    return canMatch(patternIndex + 1, routeIndex + 1);
  }

  return canMatch(0, 0);
}

function collectAppPageEntrypoints(
  directory: string,
  routeRoot = appRoot,
  ancestorRealDirectories: ReadonlySet<string> = new Set(),
): AppPageEntrypoint[] {
  const realDirectory = realpathSync(directory);
  if (ancestorRealDirectories.has(realDirectory)) {
    throw new Error(
      `Retired route scanner detected a symlink cycle at ${relative(routeRoot, directory)}`,
    );
  }
  const nextAncestors = new Set(ancestorRealDirectories);
  nextAncestors.add(realDirectory);

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry): AppPageEntrypoint[] => {
    const absolutePath = join(directory, entry.name);
    if (entry.name.startsWith('_')) return [];

    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = statSync(absolutePath);
        isDirectory = target.isDirectory();
        isFile = target.isFile();
      } catch (error) {
        throw new Error(
          `Retired route scanner could not resolve symlink ${relative(routeRoot, absolutePath)}: ${String(error)}`,
        );
      }
    }

    if (isDirectory) {
      return collectAppPageEntrypoints(absolutePath, routeRoot, nextAncestors);
    }
    if (!isFile || !appPageExtensions.some(
      (extension) => entry.name === `page.${extension}`,
    )) return [];
    const href = appRouteSegmentsToHref(
      relative(routeRoot, directory).split(sep).filter(Boolean),
    );
    if (href === null) return [];
    return [{ href, relativePath: relative(routeRoot, absolutePath) }];
  });
}
function hrefPathname(href: string): string { return href.split(/[?#]/, 1)[0]; }
function isRouteOrDescendant(candidate: string, route: string): boolean { return candidate === route || candidate.startsWith(`${route}/`); }
const sidebarPathnames = menuSections.flatMap((section) => section.items.map((item) => hrefPathname(item.href)));
const appPageEntrypoints = collectAppPageEntrypoints(appRoot);

const fixtureRoots: string[] = [];

function createFixtureRoot(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'kiditem-route-scanner-'));
  fixtureRoots.push(fixtureRoot);
  return fixtureRoot;
}

afterEach(() => {
  for (const fixtureRoot of fixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

describe('App Router scanner configuration', () => {
  it('uses root app before src/app when both exist', () => {
    const projectRoot = createFixtureRoot();
    mkdirSync(join(projectRoot, 'app'), { recursive: true });
    mkdirSync(join(projectRoot, 'src/app'), { recursive: true });

    expect(resolveEffectiveAppRoot(projectRoot)).toBe(join(projectRoot, 'app'));
  });

  it('keeps this repository on the intended src/app root', () => {
    expect(appRoot).toBe(expectedSrcAppRoot);
    expect(existsSync(join(webRoot, 'app'))).toBe(false);
    expect(appPageExtensions).toEqual(['tsx', 'ts', 'jsx', 'js']);
  });

  it('uses native Next defaults when no config file exists', () => {
    const projectRoot = createFixtureRoot();

    expect(pageExtensionsForNextProjectRoot(projectRoot))
      .toEqual(['tsx', 'ts', 'jsx', 'js']);
  });

  it('uses Next config-file precedence before checking pageExtensions', () => {
    const projectRoot = createFixtureRoot();
    writeFileSync(join(projectRoot, 'next.config.js'), `
      module.exports = { pageExtensions: ['js-priority'] };
    `);
    writeFileSync(join(projectRoot, 'next.config.mjs'), 'export default {};');
    writeFileSync(join(projectRoot, 'next.config.ts'), `
      export default { pageExtensions: ['ts-lower-priority'] };
    `);

    expect(() => pageExtensionsForNextProjectRoot(projectRoot))
      .toThrow(/next\.config\.js.*pageExtensions/i);
  });

  it('uses next.config.mjs before next.config.ts', () => {
    const projectRoot = createFixtureRoot();
    writeFileSync(join(projectRoot, 'next.config.mjs'), `
      export default { pageExtensions: ['mjs-priority'] };
    `);
    writeFileSync(join(projectRoot, 'next.config.ts'), `
      export default { pageExtensions: ['ts-lower-priority'] };
    `);

    expect(() => pageExtensionsForNextProjectRoot(projectRoot))
      .toThrow(/next\.config\.mjs.*pageExtensions/i);
  });

  it('loads next.config.ts when it is the effective config file', () => {
    const projectRoot = createFixtureRoot();
    writeFileSync(join(projectRoot, 'next.config.ts'), `
      export default { pageExtensions: ['ts-effective'] };
    `);

    expect(() => pageExtensionsForNextProjectRoot(projectRoot))
      .toThrow(/next\.config\.ts.*pageExtensions/i);
  });

  it('awaits a directly exported config Promise', () => {
    const projectRoot = createFixtureRoot();
    writeFileSync(join(projectRoot, 'next.config.mjs'), `
      export default Promise.resolve({ pageExtensions: ['promised'] });
    `);

    expect(() => pageExtensionsForNextProjectRoot(projectRoot))
      .toThrow(/next\.config\.mjs.*\["promised"\]/i);
  });

  it('catches async Promise and environment-derived custom pageExtensions', () => {
    const projectRoot = createFixtureRoot();
    writeFileSync(join(projectRoot, '.env.production'), `
      KIDITEM_SCANNER_CUSTOM_EXTENSION=production-extension
    `);
    writeFileSync(join(projectRoot, '.env.test'), `
      KIDITEM_SCANNER_CUSTOM_EXTENSION=test-extension
    `);
    writeFileSync(join(projectRoot, 'next.config.mjs'), `
      export default async function config(phase, { defaultConfig }) {
        if (phase !== 'phase-production-build') throw new Error('wrong phase');
        await Promise.resolve();
        if (process.env.KIDITEM_SCANNER_CUSTOM_EXTENSION !== 'production-extension') {
          throw new Error('wrong environment');
        }
        return Promise.resolve({
          pageExtensions: [
            process.env.KIDITEM_SCANNER_CUSTOM_EXTENSION,
            defaultConfig.pageExtensions[0],
          ],
        });
      }
    `);
    const childEnv = { ...process.env };
    delete childEnv.KIDITEM_SCANNER_CUSTOM_EXTENSION;

    expect(() => pageExtensionsForNextProjectRoot(projectRoot, childEnv))
      .toThrow(/next\.config\.mjs.*pageExtensions/i);
  });
});

describe('App Router route pattern helpers', () => {
  it.each([
    [['(inventory)', 'outbound'], '/outbound'],
    [['@slot', 'outbound'], '/outbound'],
  ])('maps %j to %s without non-URL segments', (segments, expectedHref) => {
    expect(appRouteSegmentsToHref(segments)).toBe(expectedHref);
  });

  it('ignores private subtrees', () => {
    expect(appRouteSegmentsToHref(['inventory', '_private', 'outbound'])).toBeNull();
  });

  it.each([
    [['(.)outbound'], '/outbound'],
    [['inventory', '(..)outbound'], '/outbound'],
    [['operations', 'inventory', '(..)(..)outbound'], '/outbound'],
    [['inventory', '(...)outbound'], '/outbound'],
  ])('normalizes intercepted route %j to %s', (segments, expectedHref) => {
    const href = appRouteSegmentsToHref(segments);

    expect(href).toBe(expectedHref);
    expect(routePatternCanMatchRouteOrDescendant(href!, '/outbound')).toBe(true);
  });

  it('consumes only the longest exact marker from three repeated parent tokens', () => {
    expect(appRouteSegmentsToHref([
      'operations',
      'inventory',
      'detail',
      '(..)(..)(..)outbound',
    ])).toBe('/operations/(..)outbound');
  });

  it.each([
    [['(..)outbound']],
    [['inventory', '(..)(..)outbound']],
  ])('fails closed when %j climbs above the route root', (segments) => {
    expect(() => appRouteSegmentsToHref(segments)).toThrow(/route root/i);
  });

  it.each([
    ['/[slug]', true],
    ['/[...slug]', true],
    ['/[[...slug]]', true],
    ['/outbound/[id]', true],
    ['/inventory/[id]', false],
  ])('%s overlap with /outbound is %s', (pattern, expected) => {
    expect(routePatternCanMatchRouteOrDescendant(pattern, '/outbound')).toBe(expected);
  });
});

describe('App Router symlink discovery', () => {
  it('follows a symlinked route directory using its logical route name', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureAppRoot = join(fixtureRoot, 'src/app');
    const targetDirectory = join(fixtureRoot, 'route-target');
    mkdirSync(targetDirectory, { recursive: true });
    mkdirSync(fixtureAppRoot, { recursive: true });
    writeFileSync(join(targetDirectory, 'page.tsx'), 'export default function Page() {}');
    symlinkSync(targetDirectory, join(fixtureAppRoot, 'outbound'), 'dir');

    expect(collectAppPageEntrypoints(fixtureAppRoot, fixtureAppRoot)).toContainEqual({
      href: '/outbound',
      relativePath: 'outbound/page.tsx',
    });
  });

  it('follows a symlinked page file', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureAppRoot = join(fixtureRoot, 'src/app');
    const routeDirectory = join(fixtureAppRoot, 'outbound');
    const targetPage = join(fixtureRoot, 'target-page.tsx');
    mkdirSync(routeDirectory, { recursive: true });
    writeFileSync(targetPage, 'export default function Page() {}');
    symlinkSync(targetPage, join(routeDirectory, 'page.tsx'), 'file');

    expect(collectAppPageEntrypoints(fixtureAppRoot, fixtureAppRoot)).toContainEqual({
      href: '/outbound',
      relativePath: 'outbound/page.tsx',
    });
  });

  it('fails closed on a symlink cycle', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureAppRoot = join(fixtureRoot, 'src/app');
    const routeDirectory = join(fixtureAppRoot, 'inventory');
    mkdirSync(routeDirectory, { recursive: true });
    symlinkSync(routeDirectory, join(routeDirectory, 'loop'), 'dir');

    expect(() => collectAppPageEntrypoints(fixtureAppRoot, fixtureAppRoot))
      .toThrow(/symlink cycle/i);
  });
});

describe('retired sidebar routes', () => {
  it.each(retiredSidebarRoutes)('%s has no navigation or App Router entrypoint', (route) => {
    expect(sidebarPathnames.filter((pathname) => isRouteOrDescendant(pathname, route))).toEqual([]);
    expect(appPageEntrypoints
      .filter(({ href }) => routePatternCanMatchRouteOrDescendant(href, route))
      .map(({ relativePath }) => relativePath)).toEqual([]);
  });
});
