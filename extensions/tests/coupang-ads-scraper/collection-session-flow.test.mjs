import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const extensionRoot = path.join(repoRoot, 'extensions/coupang-ads-scraper');
const worker = fs.readFileSync(
  path.join(extensionRoot, 'background/service-worker.js'),
  'utf8',
);
const catalog = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang-catalog-import.js'),
  'utf8',
);
const collectionWindowSource = fs.readFileSync(
  path.join(extensionRoot, 'background/collection-window.js'),
  'utf8',
);
const collectionRunsSource = fs.readFileSync(
  path.join(extensionRoot, 'background/collection-runs.js'),
  'utf8',
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
);

test('loads the canonical session manager and focus owners before collector runtimes', () => {
  const collectionSession = worker.indexOf('"collection-session.js"');
  const collectionWindow = worker.indexOf('"collection-window.js"');
  const interactiveTabs = worker.indexOf('"interactive-tabs.js"');
  const catalogRuntime = worker.indexOf('"coupang-catalog-import.js"');

  assert.ok(collectionSession >= 0);
  assert.ok(collectionWindow > collectionSession);
  assert.ok(interactiveTabs > collectionWindow);
  assert.ok(catalogRuntime > interactiveTabs);
  assert.match(worker, /storageKey:\s*["']kiditem_collection_sessions["']/);
  assert.match(worker, /webUrlPatterns:\s*\[["']http:\/\/localhost:3000\/\*["']\]/);
});

test('handles generic collection controls before producer actions', () => {
  const genericControl = worker.indexOf('msg.action === "listCollectionSessions"');
  const scrapeTargets = worker.indexOf('msg.action === "scrapeTargets"');
  assert.ok(genericControl >= 0 && genericControl < scrapeTargets);
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
    'restartCollectionSession',
  ]) {
    assert.match(worker, new RegExp(`msg\\.action === ["']${action}["']`));
  }
  assert.match(collectionRunsSource, /restartStrategy !== ["']extension["']/);
  assert.match(collectionRunsSource, /reason:\s*["']manual_confirmation["']/);
  assert.match(collectionRunsSource, /forceRestart:\s*true/);
  assert.match(collectionRunsSource, /options\.restartCatalog/);
});

test('persists only allowlisted Coupang producers and advertises the capability', () => {
  const producerSources = `${worker}\n${collectionRunsSource}`;
  for (const producer of [
    'dashboard.wing_sales',
    'dashboard.rocket_sales',
    'dashboard.coupang_ads',
    'dashboard.coupang_products',
    'dashboard.wing_kpi',
    'advertising.ad_sync',
    'advertising.scrape_targets',
    'advertising.wing_rank',
    'advertising.keyword_rank',
    'advertising.competitor_catalog',
    'channels.coupang_catalog',
  ]) {
    assert.match(producerSources, new RegExp(producer.replace('.', '\\.')));
  }
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(worker, /unsupported collection producer/i);
  assert.equal(manifest.version, '1.2.32');
});

test('the scrape-target producer owns one serialized silent window lifecycle', () => {
  assert.match(worker, /collectionWindow\.collectTargets/);
  assert.match(collectionWindowSource, /runExclusive\(async \(\) =>/);
  assert.match(collectionWindowSource, /getOrCreate\(runId/);
  assert.match(collectionWindowSource, /navigate\(runId/);
  assert.match(collectionWindowSource, /sessions\.attachTab\(runId/);
  assert.match(collectionWindowSource, /sessions\.progress\(runId/);
  assert.match(collectionWindowSource, /sessions\.succeed\(runId\)/);
  assert.match(collectionWindowSource, /sessions\.cancel\(runId\)/);
  assert.match(collectionWindowSource, /close\(runId\)/);
  assert.match(
    collectionWindowSource,
    /for \(let index = 0; index < targets\.length; index \+= 1\)/,
  );
  assert.doesNotMatch(collectionWindowSource, /Promise\.all\(\s*targets/);
});

test('automatic collectors contain no direct focus primitives', () => {
  for (const [name, source] of [
    ['service worker', worker],
    ['catalog import', catalog],
  ]) {
    assert.doesNotMatch(source, /active:\s*true/, `${name} activates a tab directly`);
    assert.doesNotMatch(source, /focused:\s*true/, `${name} focuses a window directly`);
    assert.doesNotMatch(source, /\bactivateTab\s*\(/, `${name} uses legacy activateTab`);
  }
  assert.match(catalog, /requireAttention/);
  assert.match(catalog, /clearAlarm\(\)/);
  assert.match(catalog, /attention_required/);
});

test('automatic collectors never reuse or navigate a user-active tab', () => {
  assert.match(worker, /tab\.active !== true/);
  assert.match(worker, /before\?\.active && options\.allowActive !== true/);
  assert.match(worker, /throw new Error\(["']active user tab is collection-protected["']\)/);
  assert.doesNotMatch(worker, /\.catch\(\(\) => reusableTab\)/);
  assert.ok(
    (catalog.match(/tab\?\.id\s*&&\s*tab\.active !== true/g) || []).length >= 2,
    'catalog tab reuse and cleanup must both preserve a user-active tab',
  );
});

test('interactive focus helper requires a deliberate user-action reason', async () => {
  const helperPath = path.join(extensionRoot, 'background/interactive-tabs.js');
  const calls = { create: [], update: [], focus: [] };
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create(properties, callback) {
        calls.create.push(properties);
        callback({ id: 41, windowId: 7 });
      },
      update(tabId, properties, callback) {
        calls.update.push({ tabId, properties });
        callback({ id: tabId, windowId: 7 });
      },
    },
    windows: {
      update(windowId, properties, callback) {
        calls.focus.push({ windowId, properties });
        callback({ id: windowId });
      },
    },
  };
  const context = vm.createContext({ chrome, console });
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  const interactive = context.KidItemInteractiveTabs.create({ chrome });
  const reason = context.KidItemInteractiveTabs.reasons.PRODUCT_EDIT;

  await assert.rejects(
    interactive.createTab({ url: 'https://wing.coupang.com', reason: 'batch' }),
    /interactive reason/i,
  );
  const tab = await interactive.createTab({
    url: 'https://wing.coupang.com',
    reason,
  });
  await interactive.focusTab(tab.id, reason);

  assert.deepEqual(JSON.parse(JSON.stringify(calls.create)), [
    { url: 'https://wing.coupang.com', active: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.update)), [
    { tabId: 41, properties: { active: true } },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.focus)), [
    { windowId: 7, properties: { focused: true } },
  ]);
  assert.match(worker, /interactiveTabs\.createTab/);
  assert.match(worker, /interactiveTabs\.focusTab/);
});
