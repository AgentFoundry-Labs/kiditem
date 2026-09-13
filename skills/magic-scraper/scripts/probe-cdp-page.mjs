#!/usr/bin/env node
// Page-structure probe for magic-scraper extractor development.
//
// Observation contract (magic-scraper/cdp-page-observation@1): the page URL as
// origin, templated path, and query parameter names; document and link counts;
// detail-link patterns; and embedded-state key paths with value types. Query
// values, fragments, titles, page text, cookies, and embedded values never
// enter it. Each run writes one owner-only JSON file into a private task
// directory under the OS temp directory and prints only that file's path.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OBSERVATION_CONTRACT = 'magic-scraper/cdp-page-observation@1';
const TASK_DIR_PREFIX = 'magic-scraper-probe-';
const MAX_LINK_PATTERNS = 20;

export const PAGE_LIMITS = Object.freeze({
  maxDepth: 6,
  maxKeys: 40,
  maxEntries: 400,
  maxLinks: 1000,
  maxJsonLd: 5,
});

const EMBEDDED_SOURCES = [
  'window_context_model',
  'window_context_data',
  'next_data',
  'nuxt_data',
  'init_data',
  'apollo_state',
  'detail_data',
];
const VALUE_TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'boolean',
  'null',
  'undefined',
  'bigint',
  'symbol',
  'function',
  'unreadable',
  'unparseable',
]);
// Identifier-like names are schema. Anything else (IDs, emails, tokens, text,
// query arguments) is data and collapses to `*` or `:id`.
const SAFE_NAME = /^@?[A-Za-z_$][\w$-]{0,39}$/;
const SAFE_PATH_SEGMENT = /^[A-Za-z][A-Za-z_-]{0,31}$/;
const PAGE_EXTENSION = /\.(?:s?html?|php|jsp|aspx?|do|action|json|xml)$/i;
const DETAIL_PATH = /\/(?:products?|items?|details?|offers?|listing|sku)(?:[/.]|$)/i;
const DETAIL_QUERY_KEYS = new Set(['id', 'itemid', 'productid', 'offerid', 'sku']);
const URL_IN_TEXT = /\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi;

const USAGE = `Usage:
  probe-cdp-page.mjs <http(s) url> [--endpoint http://127.0.0.1:9222] [--out-dir <task dir>] [--scrolls n]
  probe-cdp-page.mjs --cleanup <task dir>

Connects to an already-running local Chrome CDP endpoint, opens the URL in its
first page, and writes a redacted page-structure observation
(${OBSERVATION_CONTRACT}) as an owner-only file in a private
${TASK_DIR_PREFIX}* directory under the OS temp directory. Prints only the file
path. Playwright resolves from the current workspace, then from this skill's
checkout.

  --out-dir <dir>  Write into a task directory from an earlier run.
  --cleanup <dir>  Delete a task directory when the task is finished.`;

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {
    url: '',
    endpoint: process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT || 'http://127.0.0.1:9222',
    outDir: '',
    cleanup: '',
    scrolls: 4,
    help: false,
  };
  const valueFlags = {
    '--endpoint': 'endpoint',
    '--out-dir': 'outDir',
    '--cleanup': 'cleanup',
    '--scrolls': 'scrolls',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      args.help = true;
    } else if (Object.hasOwn(valueFlags, value)) {
      if (index + 1 >= argv.length) throw new Error(`${value} requires a value`);
      args[valueFlags[value]] = argv[++index];
    } else if (value.startsWith('-')) {
      throw new Error(`Unknown option: ${value.split('=')[0]}`);
    } else if (args.url) {
      throw new Error('Pass exactly one URL');
    } else {
      args.url = value;
    }
  }
  if (args.help) return args;
  if (args.cleanup) {
    if (args.url || args.outDir) throw new Error('--cleanup takes only the task directory');
    return args;
  }
  if (!parseHttpUrl(args.url)) throw new Error('Pass one absolute http(s) URL');
  if (!args.endpoint) throw new Error('Missing CDP endpoint');
  args.scrolls = Number(args.scrolls);
  if (!Number.isInteger(args.scrolls) || args.scrolls < 0 || args.scrolls > 20) {
    throw new Error('--scrolls must be an integer from 0 to 20');
  }
  return args;
}

// Prefer the workspace under investigation, then the checkout that ships this skill.
function loadPlaywright(cwd = process.cwd(), modulePath = fileURLToPath(import.meta.url)) {
  for (const base of [join(cwd, 'package.json'), modulePath]) {
    try {
      return createRequire(base)('playwright');
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error('Cannot resolve playwright from the working directory or this skill checkout');
}

// Runs inside the page through Playwright, so it must stay self-contained.
// Values never leave the page: text comes back as lengths and embedded state as
// key paths with value types. buildObservation() still treats the result as
// untrusted and redacts it before anything is written.
export function collectPageSnapshot(limits, scope = globalThis) {
  const describe = (root) => {
    const entries = [];
    const queue = [{ path: [], read: () => root }];
    let truncated = false;
    for (let index = 0; index < queue.length; index += 1) {
      const { path, read } = queue[index];
      let value;
      let type;
      let size;
      let children = [];
      try {
        value = read();
        type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        if (type === 'array') {
          size = value.length;
          children = size > 0 ? [0] : [];
        } else if (type === 'object') {
          const keys = Object.keys(value);
          size = keys.length;
          children = keys.slice(0, limits.maxKeys);
          if (size > limits.maxKeys) truncated = true;
        }
      } catch {
        entries.push({ path, type: 'unreadable' });
        continue;
      }
      entries.push(size === undefined ? { path, type } : { path, type, size });
      if (children.length > 0 && path.length >= limits.maxDepth) {
        truncated = true;
        continue;
      }
      for (const child of children) {
        if (queue.length >= limits.maxEntries) {
          truncated = true;
          break;
        }
        queue.push({ path: [...path, child], read: () => value[child] });
      }
    }
    return { entries, truncated };
  };
  const inspect = (read) => {
    let value;
    try {
      value = read();
    } catch {
      return { entries: [{ path: [], type: 'unreadable' }], truncated: false };
    }
    return value === undefined || value === null ? null : describe(value);
  };
  const inspectJson = (script) => {
    let value;
    try {
      value = JSON.parse(script.textContent || '');
    } catch {
      return { entries: [{ path: [], type: 'unparseable' }], truncated: false };
    }
    return describe(value);
  };

  const { document, location } = scope;
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const nextData = document.querySelector('script#__NEXT_DATA__');
  return {
    href: String(location.href),
    html_length: document.documentElement ? document.documentElement.outerHTML.length : 0,
    body_text_length: document.body ? String(document.body.innerText || '').length : 0,
    link_total: anchors.length,
    link_hrefs: anchors.slice(0, limits.maxLinks).map((anchor) => String(anchor.href)),
    embedded: {
      window_context_model: inspect(() => scope.context?.result?.global?.globalData?.model),
      window_context_data: inspect(() => scope.context?.result?.data),
      next_data: nextData ? inspectJson(nextData) : null,
      nuxt_data: inspect(() => scope.__NUXT__),
      init_data: inspect(() => scope.__INIT_DATA__),
      apollo_state: inspect(() => scope.__APOLLO_STATE__),
      detail_data: inspect(() => scope.detailData),
      json_ld: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .slice(0, limits.maxJsonLd)
        .map(inspectJson),
    },
  };
}

function safeName(name) {
  return typeof name === 'string' && SAFE_NAME.test(name) && name.replace(/\D/g, '').length <= 4
    ? name
    : '*';
}

function describeUrl(url) {
  const path = url.pathname
    .split('/')
    .map((segment) => {
      const extension = PAGE_EXTENSION.exec(segment)?.[0] ?? '';
      const stem = segment.slice(0, segment.length - extension.length);
      return segment === '' || SAFE_PATH_SEGMENT.test(stem) ? segment : `:id${extension}`;
    })
    .join('/');
  const queryKeys = [...new Set([...url.searchParams.keys()].map(safeName))].sort();
  return { origin: `${url.protocol}//${url.host}`, path, query_keys: queryKeys };
}

function isDetailUrl(url) {
  return DETAIL_PATH.test(`/${url.hostname}${url.pathname}`)
    || [...url.searchParams.keys()].some((key) => DETAIL_QUERY_KEYS.has(key.toLowerCase()));
}

function describeLinks(hrefs, total) {
  const patterns = new Map();
  let candidates = 0;
  for (const href of Array.isArray(hrefs) ? hrefs.slice(0, PAGE_LIMITS.maxLinks) : []) {
    const url = parseHttpUrl(href);
    if (!url || !isDetailUrl(url)) continue;
    candidates += 1;
    const pattern = describeUrl(url);
    const key = JSON.stringify(pattern);
    const known = patterns.get(key);
    if (known) known.count += 1;
    else patterns.set(key, { ...pattern, count: 1 });
  }
  return {
    total: toCount(total),
    detail_candidates: candidates,
    detail_patterns: [...patterns.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, MAX_LINK_PATTERNS),
  };
}

function describeStructure(raw) {
  if (!Array.isArray(raw?.entries)) return null;
  const types = new Map();
  for (const entry of raw.entries.slice(0, PAGE_LIMITS.maxEntries)) {
    if (!Array.isArray(entry?.path) || entry.path.length > PAGE_LIMITS.maxDepth) continue;
    const type = VALUE_TYPES.has(entry.type) ? entry.type : 'unknown';
    const sized = (type === 'object' || type === 'array') && toCount(entry.size) !== null;
    const path = entry.path.reduce(
      (text, segment) => (typeof segment === 'number' ? `${text}[]` : `${text}.${safeName(segment)}`),
      '$',
    );
    types.set(path, (types.get(path) ?? new Set()).add(sized ? `${type}(${entry.size})` : type));
  }
  return {
    paths: Object.fromEntries(
      [...types.keys()].sort().map((path) => [path, mergeTypes(types.get(path))]),
    ),
    truncated: raw.truncated === true || raw.entries.length > PAGE_LIMITS.maxEntries,
  };
}

// Keys collapsed to `*` merge their subtrees; differing sizes drop to the bare type.
function mergeTypes(types) {
  if (types.size === 1) return [...types][0];
  return [...new Set([...types].map((type) => type.replace(/\(\d+\)$/, '')))].sort().join('|');
}

function toCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function buildObservation(snapshot, observedAt = new Date()) {
  const pageUrl = parseHttpUrl(snapshot?.href);
  const embedded = snapshot?.embedded;
  return {
    contract: OBSERVATION_CONTRACT,
    observed_at: observedAt.toISOString(),
    page: pageUrl ? describeUrl(pageUrl) : null,
    document: {
      html_length: toCount(snapshot?.html_length),
      body_text_length: toCount(snapshot?.body_text_length),
    },
    links: describeLinks(snapshot?.link_hrefs, snapshot?.link_total),
    embedded: {
      ...Object.fromEntries(
        EMBEDDED_SOURCES.map((name) => [name, describeStructure(embedded?.[name])]),
      ),
      json_ld: (Array.isArray(embedded?.json_ld) ? embedded.json_ld.slice(0, PAGE_LIMITS.maxJsonLd) : [])
        .map(describeStructure)
        .filter(Boolean),
    },
  };
}

function resolveTaskDir(dir, root) {
  let resolved = '';
  let stats;
  try {
    resolved = realpathSync(dir);
    stats = statSync(resolved);
  } catch {
    // Rejected below like any other directory outside the contract.
  }
  const ownerOnly = process.platform === 'win32'
    || (stats?.uid === process.getuid() && (stats.mode & 0o077) === 0);
  if (
    !stats?.isDirectory()
    || dirname(resolved) !== root
    || !basename(resolved).startsWith(TASK_DIR_PREFIX)
    || !ownerOnly
  ) {
    throw new Error(`Task directory must be a private ${TASK_DIR_PREFIX}* directory directly under ${root}`);
  }
  return resolved;
}

function writeObservation(observation, root, outDir) {
  const taskDir = outDir ? resolveTaskDir(outDir, root) : mkdtempSync(join(root, TASK_DIR_PREFIX));
  const file = join(taskDir, `observation-${Date.now()}-${randomBytes(4).toString('hex')}.json`);
  try {
    writeFileSync(file, `${JSON.stringify(observation, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (!outDir) rmSync(taskDir, { recursive: true, force: true });
    throw error;
  }
  return file;
}

function redactErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  // Playwright appends call logs that repeat navigation URLs after the first line.
  return message.split('\n', 1)[0].replace(URL_IN_TEXT, (raw) => {
    try {
      const { origin, path } = describeUrl(new URL(raw));
      return `${origin}${path}`;
    } catch {
      return '[url]';
    }
  });
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const root = realpathSync(tmpdir());
  if (args.cleanup) {
    const taskDir = resolveTaskDir(args.cleanup, root);
    rmSync(taskDir, { recursive: true });
    console.log(taskDir);
    return;
  }
  if (args.outDir) resolveTaskDir(args.outDir, root);

  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(args.endpoint, { timeout: 20_000 });
  let snapshot;
  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => undefined);
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
    for (let index = 1; index <= args.scrolls; index += 1) {
      await page.evaluate(
        (ratio, scope = globalThis) => scope.scrollTo(0, scope.document.documentElement.scrollHeight * ratio),
        index / args.scrolls,
      );
      await page.waitForTimeout(700);
    }
    snapshot = await page.evaluate(collectPageSnapshot, PAGE_LIMITS);
  } finally {
    await browser.close().catch(() => undefined);
  }
  console.log(writeObservation(buildObservation(snapshot), root, args.outDir));
}

// Skill discovery links (.agents/skills, .claude/skills) make argv[1] a symlink
// path while import.meta.url is the real file.
function isEntrypoint() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`probe-cdp-page failed: ${redactErrorMessage(error)}`);
    process.exit(1);
  });
}
