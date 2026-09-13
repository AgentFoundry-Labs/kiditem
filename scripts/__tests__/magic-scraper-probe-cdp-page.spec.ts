import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PAGE_LIMITS,
  buildObservation,
  collectPageSnapshot,
} from '../../skills/magic-scraper/scripts/probe-cdp-page.mjs';

type SyntheticPageScope = {
  document: { body: { innerText: string }; documentElement: { outerHTML: string } };
};

const fixtureDir = join(__dirname, 'fixtures', 'magic-scraper-cdp-probe');
const { SECRET, createSyntheticPageScope } = createRequire(import.meta.url)(
  join(fixtureDir, 'synthetic-page.cjs'),
) as { SECRET: string; createSyntheticPageScope: () => SyntheticPageScope };
const probeScript = join(__dirname, '..', '..', 'skills', 'magic-scraper', 'scripts', 'probe-cdp-page.mjs');
// The fake Playwright ignores the endpoint; a real one would find nothing listening here.
const unreachableEndpoint = 'http://127.0.0.1:9';
const pageUrl = `https://shop.example.test/products/${SECRET}-5d41402a?page=2&token=${SECRET}-ARGUMENT`;
const observedAt = new Date('2026-01-01T00:00:00.000Z');
const taskDirRefusal = 'Task directory must be a private magic-scraper-probe-* directory';
// Windows has no POSIX modes, and creating symlinks there needs extra privileges.
const posix = process.platform !== 'win32';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A throwaway OS temp root plus a workspace whose node_modules holds the fake Playwright.
function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiditem-cdp-probe-')));
  roots.push(root);
  const tempRoot = join(root, 'tmp');
  const workspace = join(root, 'workspace');
  const playwright = join(workspace, 'node_modules', 'playwright');
  mkdirSync(tempRoot, { mode: 0o700 });
  mkdirSync(playwright, { recursive: true });
  writeFileSync(join(playwright, 'package.json'), '{"name":"playwright","main":"index.js"}\n');
  writeFileSync(
    join(playwright, 'index.js'),
    `module.exports = require(${JSON.stringify(join(fixtureDir, 'fake-playwright.cjs'))});\n`,
  );
  return { root, tempRoot, workspace };
}

function runProbe(args: string[], options: { cwd: string; tempRoot: string; script?: string }) {
  // A zero umask makes the observed modes exactly the ones the probe requests.
  const clearUmask = 'data:text/javascript,process.umask(0)';
  return spawnSync(process.execPath, ['--import', clearUmask, options.script ?? probeScript, ...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: options.tempRoot, TMP: options.tempRoot, TEMP: options.tempRoot },
  });
}

describe('magic-scraper CDP page probe', () => {
  it('reduces a page to structure without query values, text, or embedded values', () => {
    const scope = createSyntheticPageScope();

    const observation = buildObservation(collectPageSnapshot(PAGE_LIMITS, scope), observedAt);

    expect(JSON.stringify(observation)).not.toContain(SECRET);
    expect(observation).toEqual({
      contract: 'magic-scraper/cdp-page-observation@1',
      observed_at: '2026-01-01T00:00:00.000Z',
      page: { origin: 'https://shop.example.test', path: '/products/:id', query_keys: ['page', 'token'] },
      document: {
        html_length: scope.document.documentElement.outerHTML.length,
        body_text_length: scope.document.body.innerText.length,
      },
      links: {
        total: 5,
        detail_candidates: 3,
        detail_patterns: [
          { origin: 'https://shop.example.test', path: '/products/:id', query_keys: ['ref', 'session'], count: 2 },
          { origin: 'https://shop.example.test', path: '/offer/:id.html', query_keys: [], count: 1 },
        ],
      },
      embedded: {
        window_context_model: {
          paths: {
            $: 'object(2)',
            '$.offerDetail': 'object(3)',
            '$.offerDetail.imageList': 'array(1)',
            '$.offerDetail.imageList[]': 'object(1)',
            // fullPathImageURI has three case switches, so it collapses like a token.
            '$.offerDetail.imageList[].*': 'string',
            '$.offerDetail.offerId': 'number',
            '$.offerDetail.subject': 'string',
            '$.tradeModel': 'object(2)',
            '$.tradeModel.minPrice': 'string',
            '$.tradeModel.skuMap': 'array(0)',
          },
          truncated: false,
        },
        window_context_data: {
          paths: {
            $: 'object(1)',
            '$.productPackInfo': 'object(1)',
            '$.productPackInfo.fields': 'object(1)',
            '$.productPackInfo.fields.unitWeight': 'number',
          },
          truncated: false,
        },
        next_data: {
          paths: {
            $: 'object(2)',
            '$.buildId': 'string',
            '$.props': 'object(1)',
            '$.props.pageProps': 'object(2)',
            '$.props.pageProps.items': 'array(2)',
            '$.props.pageProps.items[]': 'object(2)',
            '$.props.pageProps.items[].offerId': 'number',
            '$.props.pageProps.items[].title': 'string',
            '$.props.pageProps.viewer': 'object(2)',
            '$.props.pageProps.viewer.csrfToken': 'string',
            '$.props.pageProps.viewer.email': 'string',
          },
          truncated: false,
        },
        nuxt_data: null,
        init_data: {
          paths: {
            $: 'object(2)',
            '$.*': 'object(1)',
            '$.*.token': 'string',
            '$.user': 'object(2)',
            '$.user.loggedIn': 'boolean',
            '$.user.nickname': 'string',
          },
          truncated: false,
        },
        apollo_state: {
          paths: {
            $: 'object(3)',
            '$.*': 'object(2)',
            '$.*.__typename': 'string',
            '$.*.email': 'null|string',
            '$.ROOT_QUERY': 'object(1)',
            '$.ROOT_QUERY.viewer': 'object(1)',
            '$.ROOT_QUERY.viewer.__ref': 'string',
          },
          truncated: false,
        },
        detail_data: null,
        json_ld: [
          {
            paths: {
              $: 'object(4)',
              '$.@context': 'string',
              '$.@type': 'string',
              '$.name': 'string',
              '$.offers': 'object(1)',
              '$.offers.price': 'string',
            },
            truncated: false,
          },
          { paths: { $: 'unparseable' }, truncated: false },
        ],
      },
    });
  });

  it('treats the page snapshot as untrusted and emits only contract fields', () => {
    const observation = buildObservation(
      {
        href: `https://${SECRET}-USER:${SECRET}-PASS@shop.example.test/cart?coupon=${SECRET}-COUPON`,
        html_length: `${SECRET}-LENGTH`,
        body_text: `${SECRET}-BODY`,
        link_total: -1,
        link_hrefs: [`javascript:alert("${SECRET}-SCRIPT")`, `https://shop.example.test/item/${SECRET}%20name`],
        embedded: {
          init_data: {
            entries: [
              { path: [], type: `${SECRET}-TYPE`, size: `${SECRET}-SIZE` },
              { path: [`${SECRET}:key`], type: 'string', value: `${SECRET}-VALUE` },
            ],
            truncated: `${SECRET}-TRUNCATED`,
          },
          [`${SECRET}_source`]: { entries: [{ path: [], type: 'string' }] },
          json_ld: [{ entries: [{ path: [], type: 'object', size: 1, sample: `${SECRET}-SAMPLE` }] }, SECRET],
        },
      },
      observedAt,
    );

    expect(JSON.stringify(observation)).not.toContain(SECRET);
    expect(observation).toEqual({
      contract: 'magic-scraper/cdp-page-observation@1',
      observed_at: '2026-01-01T00:00:00.000Z',
      page: { origin: 'https://shop.example.test', path: '/cart', query_keys: ['coupon'] },
      document: { html_length: null, body_text_length: null },
      links: {
        total: null,
        detail_candidates: 1,
        detail_patterns: [{ origin: 'https://shop.example.test', path: '/item/:id', query_keys: [], count: 1 }],
      },
      embedded: {
        window_context_model: null,
        window_context_data: null,
        next_data: null,
        nuxt_data: null,
        init_data: { paths: { $: 'unknown', '$.*': 'string' }, truncated: false },
        apollo_state: null,
        detail_data: null,
        json_ld: [{ paths: { $: 'object(1)' }, truncated: false }],
      },
    });
  });

  it('keeps only word-like embedded-state keys', () => {
    const kept = ['offerId', '@type', '__typename', 'leafCategoryName', 'sha256', 'k'.repeat(32)];
    const replaced = [
      'V1StGXR8_Z5jdHi6B-myT', // nanoid
      'v1Token', // digit before letters
      'offer1234', // four trailing digits
      'offer12345',
      'mainImageListUrl', // three case switches
      'k'.repeat(33),
      'k'.repeat(41),
    ];
    const keys = [...kept, ...replaced];

    const observation = buildObservation(
      {
        embedded: {
          init_data: {
            entries: [
              { path: [], type: 'object', size: keys.length },
              ...keys.map((key) => ({ path: [key], type: 'string' })),
            ],
          },
        },
      },
      observedAt,
    );

    expect(observation.embedded.init_data).toEqual({
      paths: {
        $: `object(${keys.length})`,
        ...Object.fromEntries(kept.map((key) => [`$.${key}`, 'string'])),
        '$.*': 'string',
      },
      truncated: false,
    });
  });

  it('keeps only word-like path segments', () => {
    const kept = ['products', 'best-sellers', 'goods_view', 'goodsDetailView', 'ProductDetail.aspx', 's'.repeat(32)];
    const replaced = [
      'KxPqRmZtWvNbLcDsQwEr', // letters-only token
      'mainImageListView', // three case switches
      'v2',
      '@shop',
      's'.repeat(33),
    ];

    const observation = buildObservation(
      { href: `https://shop.example.test/${[...kept, ...replaced].join('/')}` },
      observedAt,
    );

    expect(observation.page).toEqual({
      origin: 'https://shop.example.test',
      path: `/${kept.join('/')}/${replaced.map(() => ':id').join('/')}`,
      query_keys: [],
    });
  });

  it('keeps only word-like query keys, including bare ones', () => {
    const observation = buildObservation(
      { href: 'https://shop.example.test/search?pageSize=20&preview&AbCdEfGhIjKlMnOpQrSt' },
      observedAt,
    );

    expect(observation.page?.query_keys).toEqual(['*', 'pageSize', 'preview']);
  });

  it('writes an owner-only file in a private temp task directory and prints only its path', () => {
    const { tempRoot, workspace } = sandbox();

    const first = runProbe([pageUrl, '--endpoint', unreachableEndpoint], { cwd: workspace, tempRoot });

    expect(first.stderr).toBe('');
    expect(first.status).toBe(0);
    const file = first.stdout.trim();
    expect(first.stdout).toBe(`${file}\n`);
    const taskDir = dirname(file);
    expect(dirname(taskDir)).toBe(tempRoot);
    expect(basename(taskDir)).toMatch(/^magic-scraper-probe-/);
    if (posix) {
      expect(statSync(taskDir).mode & 0o777).toBe(0o700);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
    const written = readFileSync(file, 'utf8');
    expect(written).not.toContain(SECRET);
    expect(JSON.parse(written)).toMatchObject({
      contract: 'magic-scraper/cdp-page-observation@1',
      page: { origin: 'https://shop.example.test', path: '/products/:id', query_keys: ['page', 'token'] },
    });

    const second = runProbe(
      [pageUrl, '--endpoint', unreachableEndpoint, '--scrolls', '0', '--out-dir', taskDir],
      { cwd: workspace, tempRoot },
    );
    expect(second.stderr).toBe('');
    expect(dirname(second.stdout.trim())).toBe(taskDir);
    expect(readdirSync(taskDir)).toHaveLength(2);

    const cleanup = runProbe(['--cleanup', taskDir], { cwd: workspace, tempRoot });
    expect(cleanup.status).toBe(0);
    expect(existsSync(taskDir)).toBe(false);
  });

  it('refuses task directories that are symlinks, shared, foreign, or outside the temp root', () => {
    const { root, tempRoot, workspace } = sandbox();
    const valid = join(tempRoot, 'magic-scraper-probe-valid');
    const foreign = join(tempRoot, 'other-task');
    const outside = join(root, 'magic-scraper-probe-outside');
    mkdirSync(valid, { mode: 0o700 });
    mkdirSync(foreign, { mode: 0o700 });
    mkdirSync(outside, { mode: 0o700 });
    const refused = [foreign, outside];
    if (posix) {
      const shared = join(tempRoot, 'magic-scraper-probe-shared');
      const linkToValid = join(root, 'link-to-valid');
      const linkToOutside = join(tempRoot, 'magic-scraper-probe-link');
      mkdirSync(shared);
      chmodSync(shared, 0o755);
      symlinkSync(valid, linkToValid);
      symlinkSync(outside, linkToOutside);
      refused.push(shared, linkToValid, `${linkToValid}/`, linkToOutside);
    }

    for (const dir of refused) {
      const probe = runProbe([pageUrl, '--endpoint', unreachableEndpoint, '--out-dir', dir], { cwd: workspace, tempRoot });
      expect(probe.status, dir).toBe(1);
      expect(probe.stdout, dir).toBe('');
      expect(probe.stderr, dir).toContain(taskDirRefusal);

      const cleanup = runProbe(['--cleanup', dir], { cwd: workspace, tempRoot });
      expect(cleanup.status, dir).toBe(1);
      expect(cleanup.stderr, dir).toContain(taskDirRefusal);
      expect(existsSync(dir), dir).toBe(true);
    }
    expect(readdirSync(valid)).toEqual([]);
    expect(readdirSync(outside)).toEqual([]);
    expect(readdirSync(tempRoot).filter((name) => name.startsWith('magic-scraper-probe-')).sort()).toEqual(
      posix
        ? ['magic-scraper-probe-link', 'magic-scraper-probe-shared', 'magic-scraper-probe-valid']
        : ['magic-scraper-probe-valid'],
    );

    const accepted = runProbe(['--cleanup', valid], { cwd: workspace, tempRoot });
    expect(accepted.status).toBe(0);
    expect(existsSync(valid)).toBe(false);
  });

  it('keeps URLs out of failure output and leaves no task directory behind', () => {
    const { tempRoot, workspace } = sandbox();

    const probe = runProbe(
      [`https://shop.example.test/unavailable?token=${SECRET}-FAILED`, '--endpoint', unreachableEndpoint],
      { cwd: workspace, tempRoot },
    );

    expect(probe.status).toBe(1);
    expect(probe.stdout).toBe('');
    expect(probe.stderr).toBe(
      'probe-cdp-page failed: page.goto: net::ERR_CONNECTION_REFUSED at https://shop.example.test/unavailable\n',
    );
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it.each([
    ['snapshot', '0'],
    ['scroll', '1'],
  ])('reports only the stage when page evaluation fails during the %s', (stage, scrolls) => {
    const { tempRoot, workspace } = sandbox();

    const probe = runProbe(
      ['https://shop.example.test/page-script-error', '--endpoint', unreachableEndpoint, '--scrolls', scrolls],
      { cwd: workspace, tempRoot },
    );

    expect(probe.status).toBe(1);
    expect(probe.stdout).toBe('');
    expect(probe.stderr).toBe(`probe-cdp-page failed: page.evaluate failed during ${stage}\n`);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('resolves Playwright from the skill checkout when run from another directory', () => {
    const { root, tempRoot, workspace } = sandbox();
    const skillDir = join(workspace, 'skills', 'magic-scraper');
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    mkdirSync(elsewhere);
    cpSync(probeScript, join(skillDir, 'scripts', 'probe-cdp-page.mjs'));
    let skillEntry = skillDir;
    if (posix) {
      // Agents start the probe through a skill discovery link.
      const discovery = join(workspace, '.agents', 'skills');
      mkdirSync(discovery, { recursive: true });
      symlinkSync('../../skills/magic-scraper', join(discovery, 'magic-scraper'));
      skillEntry = join(discovery, 'magic-scraper');
    }

    const probe = runProbe([pageUrl, '--endpoint', unreachableEndpoint, '--scrolls', '0'], {
      cwd: elsewhere,
      tempRoot,
      script: join(skillEntry, 'scripts', 'probe-cdp-page.mjs'),
    });

    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    expect(dirname(dirname(probe.stdout.trim()))).toBe(tempRoot);
  });
});
