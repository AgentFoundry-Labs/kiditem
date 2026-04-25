#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';

function parseArgs(argv) {
  const args = { routes: [], out: '.omx/logs/sidebar-audit/sidebar-audit.json', baseUrl: process.env.WEB_BASE_URL || 'http://localhost:3001' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--routes') args.routes = argv[++i].split(',').map((route) => route.trim()).filter(Boolean);
    else if (arg.startsWith('--routes=')) args.routes = arg.slice('--routes='.length).split(',').map((route) => route.trim()).filter(Boolean);
    else if (arg === '--out') args.out = argv[++i];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--base-url') args.baseUrl = argv[++i];
    else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice('--base-url='.length);
  }
  if (args.routes.length === 0) throw new Error('Usage: node scripts/sidebar-route-audit.mjs --routes /route-a,/route-b --out .omx/logs/sidebar-audit/out.json');
  return args;
}

const MISSING_BACKEND_PATTERNS = [
  /\/api\/thumbnail-analysis(?:\/|\?|$)/,
  /\/api\/thumbnail-tracking(?:\/|\?|$)/,
  /\/api\/reviews(?:\/|\?|$)/,
  /\/api\/option-masters(?:\/|\?|$)/,
];

async function auditRoute(page, baseUrl, route) {
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const responses = [];
  const apiRequests = [];

  const onConsole = (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() });
  const onPageError = (err) => pageErrors.push({ message: err.message, stack: err.stack });
  const onRequest = (req) => {
    const url = req.url();
    if (url.includes('/api/')) apiRequests.push({ url, method: req.method() });
  };
  const onRequestFailed = (req) => failedRequests.push({ url: req.url(), failure: req.failure()?.errorText ?? null });
  const onResponse = (res) => {
    const url = res.url();
    if (url.includes('/api/') || url === new URL(route, baseUrl).toString()) responses.push({ url, status: res.status() });
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30_000 });
  const linkSelector = `a[href="${route}"]`;
  const gateSelector = `[data-sidebar-gated-route="${route}"]`;
  const hasLink = await page.$(linkSelector) !== null;
  const hasGate = await page.$(gateSelector) !== null;

  let navigationMode = 'missing-nav-item';
  if (hasLink) {
    navigationMode = 'link';
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => null),
      page.click(linkSelector),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  } else if (hasGate) {
    navigationMode = 'gated';
    await page.click(gateSelector).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  const currentUrl = page.url();
  const bodyPreview = await page.evaluate(() => document.body.innerText.slice(0, 1000));

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('request', onRequest);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);

  const relevantConsoleErrors = consoleMessages.filter((msg) => {
    if (msg.type !== 'error') return false;
    if (/Download the React DevTools/.test(msg.text)) return false;
    return true;
  });
  const relevantConsoleWarnings = consoleMessages.filter((msg) =>
    msg.type === 'warning' && /Maximum update depth|Cannot update|React/i.test(msg.text),
  );
  const missingBackendCalls = [...apiRequests, ...responses]
    .filter((entry) => MISSING_BACKEND_PATTERNS.some((pattern) => pattern.test(entry.url)))
    .map((entry) => ({ url: entry.url, method: entry.method, status: entry.status }));
  const badResponses = responses.filter((res) => res.status >= 400 && !res.url.includes('/api/panel/stream'));

  return {
    route,
    navigationMode,
    gated: navigationMode === 'gated',
    currentUrl,
    expectedNoNavigation: navigationMode === 'gated' ? !currentUrl.endsWith(route) : null,
    pageErrors,
    consoleErrors: relevantConsoleErrors,
    consoleWarnings: relevantConsoleWarnings,
    failedNetworkRequests: failedRequests.filter((req) => !req.url.includes('/api/panel/stream')),
    statusCounts: responses.reduce((acc, res) => {
      acc[res.status] = (acc[res.status] || 0) + 1;
      return acc;
    }, {}),
    badResponses,
    missingBackendCalls,
    apiRequests,
    bodyPreview,
  };
}

const args = parseArgs(process.argv.slice(2));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const routes = [];
try {
  for (const route of args.routes) {
    routes.push(await auditRoute(page, args.baseUrl, route));
  }
} finally {
  await browser.close();
}

const artifact = {
  timestamp: new Date().toISOString(),
  baseUrl: args.baseUrl,
  method: 'sidebar normal-navigation audit via Puppeteer',
  routes,
  summary: {
    totalRoutes: routes.length,
    gatedRoutes: routes.filter((route) => route.gated).length,
    pageErrors: routes.reduce((sum, route) => sum + route.pageErrors.length, 0),
    consoleErrors: routes.reduce((sum, route) => sum + route.consoleErrors.length, 0),
    consoleWarnings: routes.reduce((sum, route) => sum + route.consoleWarnings.length, 0),
    failedNetworkRequests: routes.reduce((sum, route) => sum + route.failedNetworkRequests.length, 0),
    badResponses: routes.reduce((sum, route) => sum + route.badResponses.length, 0),
    missingBackendCalls: routes.reduce((sum, route) => sum + route.missingBackendCalls.length, 0),
  },
};

await mkdir(dirname(resolve(args.out)), { recursive: true });
await writeFile(args.out, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ out: args.out, summary: artifact.summary }, null, 2));
const blockers = artifact.summary.pageErrors + artifact.summary.consoleErrors + artifact.summary.consoleWarnings + artifact.summary.failedNetworkRequests + artifact.summary.missingBackendCalls;
process.exit(blockers === 0 ? 0 : 2);
