# Background Browser Collection Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every automatic Chrome collector run without stealing focus, persist its control state across service-worker restarts, and surface personal durable alerts when user intervention is required.

**Architecture:** A focused shared Zod contract defines public browser-collection session views and control commands. Each unpacked extension contains the same small MV3 session adapter, persists private tab identity in `chrome.storage.local`, and publishes token-free session events to the always-open KidItem tab. A global web provider validates those events and drives the existing Automation-owned Operation Alert lifecycle; route surfaces use explicit open-tab, restart-from-beginning, and cancel controls.

**Tech Stack:** TypeScript, Zod, Next.js 15, React 19, TanStack Query, NestJS 11, Vitest, Chrome Manifest V3, Node test runner.

## Global Constraints

- Work directly in the existing `feat/coupang-rocket-po-confirm` checkout; do not create a git worktree.
- Preserve unrelated working-tree changes and stage only the exact files listed by each task.
- This is one browser-automation platform-boundary cleanup spanning shared contracts, Automation alerts, dashboard readiness, and the three extensions.
- Automatic collection must never focus a Chrome window or change the active tab in a user-owned window.
- Background-safe collectors use inactive tabs or service-worker requests.
- A collector with a documented foreground-timer or page-visibility dependency may use an extension-owned dedicated window created with `focused: false`. Its managed tab may remain active inside that unfocused window.
- Only `openCollectionAttentionTab`, invoked by an explicit user click, may select the managed tab and focus its window.
- Automatic collectors must never fall back to focusing the user's window. If a run cannot proceed without that focus, it transitions to `attention_required`.
- Interactive product edits, thumbnail registration, advertising mutations, file uploads, shipment downloads, and tracking uploads remain `interactive_only` and use a separate focus helper.
- Personal alert ownership is derived from authenticated server context; never send trusted `organizationId` or `actorUserId` from extension payloads.
- Keep the KidItem web tab as the Supabase refresh owner. Do not store refresh tokens in extensions and do not give the order collector a KidItem API token.
- Persist browser control state only. Do not add a universal product, keyword, page, or date cursor.
- After an interrupted execution, restart current marketplace collection from the beginning. Reattach only when the original managed tab is still executing.
- Never persist passwords, cookies, access tokens, file bodies, order rows, or marketplace response bodies in collection-session state.
- Keep substantial new behavior out of the existing 3,000+ line Coupang and order service workers; place it in focused modules and leave only dispatch/wiring changes in the workers.
- No Prisma schema, data migration, dev-data, root `VERSION`, or backend deployment change is required. Extension manifest versions advance to Coupang `1.2.32`, product scraper `2.2.1`, and order collector `0.1.65`.

---

### Task 1: Define the shared browser-collection session contract

**Files:**
- Create: `packages/shared/src/schemas/browser-collection-session.ts`
- Create: `packages/shared/src/schemas/browser-collection-session.spec.ts`
- Create: `packages/shared/src/browser-collection-session.ts`
- Modify: `packages/shared/tsup.config.ts`
- Modify: `packages/shared/package.json`

**Interfaces:**
- Consumes: Zod and the focused-export policy in `packages/shared/AGENTS.md`.
- Produces: `BrowserCollectionSessionViewSchema`, `BrowserCollectionCommandSchema`, `BrowserCollectionProducerSchema`, `BrowserCollectionStateSchema`, and their inferred types from `@kiditem/shared/browser-collection-session`.

- [ ] **Step 1: Write the failing shared-contract tests**

Cover every approved state, producer, attention reason, strict unknown-key rejection, progress bounds, UUID run identity, and the absence of browser tab IDs and secret inputs from the public view.

```ts
import { describe, expect, it } from 'vitest';
import {
  BrowserCollectionCommandSchema,
  BrowserCollectionSessionViewSchema,
} from './browser-collection-session';

const RUN_ID = '00000000-0000-4000-8000-000000000001';

it('accepts a personal browser collection attention view without tab identity', () => {
  const parsed = BrowserCollectionSessionViewSchema.parse({
    runId: RUN_ID,
    producer: 'dashboard.wing_sales',
    classification: 'background_preferred',
    status: 'attention_required',
    attempt: 1,
    restartStrategy: 'extension',
    progress: { current: 0, total: 30, completed: 0, failed: 0, label: '7/13' },
    inputIdentity: { targetCount: 30 },
    attention: {
      reason: 'marketplace_login',
      message: 'Wing 로그인이 필요합니다.',
      canOpenTab: true,
    },
    startedAt: 1783958400000,
    updatedAt: 1783958401000,
    finishedAt: null,
  });

  expect(parsed.status).toBe('attention_required');
  expect(parsed).not.toHaveProperty('managedTabId');
});

it('accepts only explicit collection control commands', () => {
  expect(BrowserCollectionCommandSchema.parse({
    action: 'openCollectionAttentionTab',
    runId: RUN_ID,
  })).toEqual({ action: 'openCollectionAttentionTab', runId: RUN_ID });
  expect(() => BrowserCollectionCommandSchema.parse({
    action: 'focusAnyTab',
    runId: RUN_ID,
  })).toThrow();
});
```

- [ ] **Step 2: Run the shared test and verify RED**

Run: `rtk npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts`

Expected: FAIL because the schema module does not exist.

- [ ] **Step 3: Implement the focused contract**

Use these exact vocabulary arrays and a strict public view. `inputIdentity` permits only bounded primitive values; it is diagnostic/restart identity, not raw input storage.

```ts
import { z } from 'zod';

export const BROWSER_COLLECTION_PRODUCERS = [
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
  'sourcing.1688_trend',
  'sourcing.live_commerce',
  'orders.mall',
] as const;

export const BROWSER_COLLECTION_STATES = [
  'idle', 'running', 'attention_required',
  'succeeded', 'failed', 'cancelled',
] as const;

export const BROWSER_COLLECTION_ATTENTION_REASONS = [
  'extension_missing', 'kiditem_auth', 'marketplace_login', 'captcha',
  'permission', 'background_timeout', 'rate_limited',
  'manual_confirmation', 'unknown',
] as const;

export const BrowserCollectionProducerSchema = z.enum(BROWSER_COLLECTION_PRODUCERS);
export const BrowserCollectionStateSchema = z.enum(BROWSER_COLLECTION_STATES);
export const BrowserCollectionClassificationSchema = z.enum([
  'background_safe', 'background_preferred', 'interactive_only',
]);
export const BrowserCollectionAttentionReasonSchema = z.enum(
  BROWSER_COLLECTION_ATTENTION_REASONS,
);
const InputValueSchema = z.union([
  z.string().max(500), z.number().finite(), z.boolean(), z.null(),
]);
const SecretIdentityKeyPattern =
  /token|password|secret|cookie|credential|file|rows|payload/i;
const InputIdentitySchema = z.record(z.string().min(1).max(80), InputValueSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 20) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many identity fields' });
    }
    for (const key of Object.keys(value)) {
      if (SecretIdentityKeyPattern.test(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Secret identity field is not allowed: ${key}`,
        });
      }
    }
  });

export const BrowserCollectionSessionViewSchema = z.object({
  runId: z.string().uuid(),
  producer: BrowserCollectionProducerSchema,
  classification: BrowserCollectionClassificationSchema.exclude(['interactive_only']),
  status: BrowserCollectionStateSchema,
  attempt: z.number().int().min(1),
  restartStrategy: z.enum(['extension', 'web']),
  progress: z.object({
    current: z.number().int().min(0),
    total: z.number().int().min(0),
    completed: z.number().int().min(0),
    failed: z.number().int().min(0),
    label: z.string().max(300).nullable(),
  }).strict(),
  inputIdentity: InputIdentitySchema,
  attention: z.object({
    reason: BrowserCollectionAttentionReasonSchema,
    message: z.string().min(1).max(2000),
    canOpenTab: z.boolean(),
  }).strict().nullable(),
  startedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative().nullable(),
}).strict().superRefine((session, context) => {
  if (session.progress.current > session.progress.total ||
      session.progress.completed + session.progress.failed > session.progress.total) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid progress bounds' });
  }
  if (session.status === 'attention_required' && session.attention === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Attention details are required' });
  }
  if (session.status !== 'attention_required' && session.attention !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unexpected attention details' });
  }
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(session.status);
  if (terminal !== (session.finishedAt !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid terminal timestamp' });
  }
});

export const BrowserCollectionCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('listCollectionSessions') }).strict(),
  z.object({ action: z.literal('getCollectionSession'), runId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('cancelCollectionSession'), runId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('openCollectionAttentionTab'), runId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('restartCollectionSession'), runId: z.string().uuid() }).strict(),
]);

export type BrowserCollectionProducer = z.infer<typeof BrowserCollectionProducerSchema>;
export type BrowserCollectionState = z.infer<typeof BrowserCollectionStateSchema>;
export type BrowserCollectionSessionView = z.infer<typeof BrowserCollectionSessionViewSchema>;
export type BrowserCollectionCommand = z.infer<typeof BrowserCollectionCommandSchema>;
```

Export the schema from `src/browser-collection-session.ts`, add that file to the `tsup` entry list, and add `./browser-collection-session` to both `exports` and `typesVersions`. Do not expand `src/index.ts` or `src/schemas/index.ts`.

- [ ] **Step 4: Run contract tests and build the shared package**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts
rtk npm run build --workspace=packages/shared
```

Expected: the focused test passes and `dist/browser-collection-session.{js,cjs,d.ts}` is generated.

- [ ] **Step 5: Commit the shared contract**

```bash
rtk git add packages/shared/src/schemas/browser-collection-session.ts \
  packages/shared/src/schemas/browser-collection-session.spec.ts \
  packages/shared/src/browser-collection-session.ts \
  packages/shared/tsup.config.ts packages/shared/package.json
rtk git commit -m "feat: define browser collection sessions"
```

### Task 2: Add browser attention to personal Operation Alerts

**Files:**
- Modify: `packages/shared/src/schemas/alerts.ts`
- Modify: `packages/shared/src/schemas/alerts.spec.ts`
- Modify: `apps/server/src/automation/application/port/in/operation-alert.port.ts`
- Modify: `apps/server/src/automation/application/service/operation-alert.service.ts`
- Modify: `apps/server/src/automation/application/service/__tests__/operation-alert.service.spec.ts`
- Modify: `apps/server/src/automation/domain/policy/browser-operation-producers.ts`
- Modify: `apps/server/src/automation/adapter/in/http/operation-alert-lifecycle.controller.ts`
- Modify: `apps/server/src/automation/adapter/in/http/dto/alerts/update-operation-alert.dto.ts`
- Modify: `apps/server/src/automation/adapter/in/http/__tests__/operation-alert-lifecycle.controller.spec.ts`

**Interfaces:**
- Consumes: `BrowserCollectionProducer` from Task 1 and authenticated `@CurrentOrganization()` / `@CurrentUser()` context.
- Produces: lifecycle status `pending`, `OperationAlertPort.attention(...)`, and canonical personal alert links containing a server-validated `collectionRun` UUID.

- [ ] **Step 1: Write failing pending-transition and producer-policy tests**

Require `pending` in `ALERT_OPERATION_LIFECYCLE_STATUSES`, verify `attention()` keeps `finishedAt = null`, defaults severity to warning, and prove browser producer links are built only from an allowlisted producer plus `browser-collection:<uuid>`.

```ts
it('pauses an operation alert for browser attention', async () => {
  prisma.alert.updateMany.mockResolvedValueOnce({ count: 1 });
  prisma.alert.findFirstOrThrow.mockResolvedValueOnce(existingAlert({
    status: 'pending',
    severity: 'warning',
    finishedAt: null,
  }));

  const alert = await service.attention(ORGANIZATION_ID, OPERATION_KEY, {
    message: 'Wing 로그인이 필요합니다.',
    metadata: { browserCollection: true, attentionReason: 'marketplace_login' },
  });

  expect(alert?.status).toBe('pending');
  expect(prisma.alert.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      status: 'pending',
      finishedAt: null,
    }),
  }));
});
```

Controller coverage must assert that user A cannot patch user B's browser alert and that a forged producer or non-UUID operation key returns `400`.

- [ ] **Step 2: Run focused shared/server tests and verify RED**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/alerts.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/automation/application/service/__tests__/operation-alert.service.spec.ts src/automation/adapter/in/http/__tests__/operation-alert-lifecycle.controller.spec.ts
```

Expected: FAIL because `pending` is not accepted by the lifecycle schema and `attention()` does not exist.

- [ ] **Step 3: Implement the attention transition**

Add `pending` to `ALERT_OPERATION_LIFECYCLE_STATUSES`, add this port method, and implement it beside `progress()`:

```ts
attention(
  organizationId: string,
  operationKey: string,
  patch?: OperationLifecyclePatch,
): Promise<AlertRecord | null>;
```

```ts
async attention(
  organizationId: string,
  operationKey: string,
  patch: OperationLifecyclePatch = {},
): Promise<AlertRecord | null> {
  const result = await this.repository.transition(organizationId, operationKey, {
    ...patch,
    status: 'pending',
    finishedAt: null,
    severityDefault: 'warning',
  });
  if (result?.status === 'pending') this.emitUpsert(result);
  return result;
}
```

Dispatch `pending` to `attention()` in `OperationAlertLifecycleController`.

- [ ] **Step 4: Canonicalize run-scoped browser producer links**

Extend `BrowserOperationProducerInput` with `operationKey`. Add a producer map keyed by every Task 1 producer. Use these route bases:

```ts
const COLLECTION_PRODUCERS = new Map<BrowserCollectionProducer, BrowserOperationProducerDefinition>([
  ['dashboard.wing_sales', { title: '쿠팡 Wing 데이터 수집', href: '/dashboard' }],
  ['dashboard.rocket_sales', { title: '쿠팡 로켓 매출 수집', href: '/sales-analysis?tab=rocket-daily' }],
  ['dashboard.coupang_ads', { title: '쿠팡 광고 데이터 수집', href: '/ad-ops' }],
  ['dashboard.coupang_products', { title: '쿠팡 상품 데이터 수집', href: '/dashboard' }],
  ['dashboard.wing_kpi', { title: 'Wing 아이템위너 KPI', href: '/dashboard' }],
  ['advertising.ad_sync', { title: '광고 동기화', href: '/ad-ops' }],
  ['advertising.scrape_targets', { title: '광고 데이터 수집', href: '/ad-ops' }],
  ['advertising.wing_rank', { title: '쿠팡 Wing 판매순위 수집', href: '/rank-tracking' }],
  ['advertising.keyword_rank', { title: '쿠팡 키워드 순위 수집', href: '/rank-tracking' }],
  ['advertising.competitor_catalog', { title: '쿠팡 경쟁상품 수집', href: '/sourcing-ai/competitor-analysis' }],
  ['channels.coupang_catalog', { title: '쿠팡 전체 상품 가져오기', href: '/product-pipeline/registered-products' }],
  ['sourcing.1688_trend', { title: '1688 트렌드 수집', href: '/sourcing-ai/market' }],
  ['sourcing.live_commerce', { title: '라이브커머스 수집', href: '/sourcing-ai/market' }],
  ['orders.mall', { title: '주문 데이터 수집', href: '/order-collection' }],
]);
```

Accept only `type = 'browser_collection'`, `sourceType = 'browser_collection_session'`, an allowlisted `sourceId`, and `/^browser-collection:([0-9a-f-]{36})$/i`. Append `collectionRun=<uuid>` with `?` or `&` according to the canonical base; never accept the request body's `href` or `title`.

- [ ] **Step 5: Run focused tests, backend build, and tenancy guards**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/alerts.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/automation/application/service/__tests__/operation-alert.service.spec.ts src/automation/adapter/in/http/__tests__/operation-alert-lifecycle.controller.spec.ts
rtk npm run build --workspace=apps/server
rtk npm run check:idor
rtk npm run check:tenant-scope
```

Expected: all tests and guards pass; no Prisma changes are reported.

- [ ] **Step 6: Commit the alert lifecycle**

```bash
rtk git add packages/shared/src/schemas/alerts.ts packages/shared/src/schemas/alerts.spec.ts \
  apps/server/src/automation/application/port/in/operation-alert.port.ts \
  apps/server/src/automation/application/service/operation-alert.service.ts \
  apps/server/src/automation/application/service/__tests__/operation-alert.service.spec.ts \
  apps/server/src/automation/domain/policy/browser-operation-producers.ts \
  apps/server/src/automation/adapter/in/http/operation-alert-lifecycle.controller.ts \
  apps/server/src/automation/adapter/in/http/dto/alerts/update-operation-alert.dto.ts \
  apps/server/src/automation/adapter/in/http/__tests__/operation-alert-lifecycle.controller.spec.ts
rtk git commit -m "feat: pause browser operation alerts"
```

### Task 3: Add identical MV3 session adapters and a focus-policy baseline

**Files:**
- Create: `extensions/shared/collection-session.js`
- Create: `extensions/scripts/sync-collection-session-adapters.mjs`
- Create: `extensions/coupang-ads-scraper/background/collection-session.js`
- Create: `extensions/product-scraper/collection-session.js`
- Create: `extensions/order-collector/background/collection-session.js`
- Create: `extensions/collection-focus-policy.json`
- Create: `extensions/tests/collection-session-adapters.test.mjs`
- Create: `extensions/tests/collection-focus-policy.test.mjs`

**Interfaces:**
- Consumes: Chrome `storage`, `tabs`, `windows`, and `scripting` APIs.
- Produces: one canonical adapter source, generated extension-local copies, and global `KidItemCollectionSession.create(options)` with `start`, `attachTab`, `progress`, `requireAttention`, `succeed`, `fail`, `cancel`, `restart`, `get`, `list`, and `openAttentionTab` methods.

- [ ] **Step 1: Write the failing adapter contract suite**

Load each generated file in a VM and run the same cases against a fake Chrome API. Require every copy to be byte-identical to `extensions/shared/collection-session.js`, require the sync script's `--check` mode to detect drift, and cover secret-key redaction, private managed tab IDs, transition publication, restart from progress zero, cooperative cancellation, and focus only from `openAttentionTab`.

```js
test('attention never focuses until the explicit open command', async () => {
  const runtime = loadAdapter('extensions/product-scraper/collection-session.js');
  const manager = runtime.create({
    chrome: fake.chrome,
    storageKey: 'sessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => 100,
  });
  await manager.start({
    runId: RUN_ID,
    producer: 'sourcing.1688_trend',
    classification: 'background_preferred',
    restartStrategy: 'extension',
    inputIdentity: { keywordCount: 2, password: 'must-not-persist' },
  });
  await manager.attachTab(RUN_ID, { tabId: 7, windowId: 2 });
  const view = await manager.requireAttention(RUN_ID, {
    reason: 'captcha',
    message: '1688 보안 확인이 필요합니다.',
  });

  assert.equal(fake.calls.tabsUpdate.length, 0);
  assert.equal(view.attention.canOpenTab, true);
  assert.equal(view.inputIdentity.password, undefined);

  await manager.openAttentionTab(RUN_ID);
  assert.deepEqual(fake.calls.tabsUpdate, [{ tabId: 7, properties: { active: true } }]);
  assert.deepEqual(fake.calls.windowsUpdate, [{ windowId: 2, properties: { focused: true } }]);
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `rtk node --test extensions/tests/collection-session-adapters.test.mjs`

Expected: FAIL because the adapter modules do not exist.

- [ ] **Step 3: Implement one canonical adapter and generate all three local copies**

Put the implementation in `extensions/shared/collection-session.js`. `sync-collection-session-adapters.mjs` copies that file verbatim to the three extension roots and supports `--check`, which exits nonzero when a copy differs. Commit the generated local files because each unpacked extension must load entirely within its own extension root; never edit those copies directly.

The public view must never expose `_managedTabId` or `_managedWindowId`. Storage is a `runId -> private session` map, terminal sessions older than seven days are pruned, and `sanitizeInputIdentity()` drops keys matching `/token|password|secret|cookie|credential|file|rows|payload/i`.

The transition core is:

```js
async function transition(runId, patch) {
  const sessions = await readSessions();
  const current = sessions[runId];
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: now() };
  sessions[runId] = next;
  await writeSessions(prune(sessions));
  const publicView = toPublicView(next);
  await publish(publicView);
  return publicView;
}
```

`restart(runId)` increments `attempt`, sets `status: 'running'`, clears attention and terminal time, and resets all progress counters to zero. It returns the sanitized `inputIdentity` and `restartStrategy`; producer dispatch remains extension-owned.

`openAttentionTab(runId)` rejects unless status is `attention_required`, activates only the stored tab, then focuses only that tab's stored window. No other method calls those focus APIs.

`publish(view)` injects this token-free event into each allowlisted KidItem tab:

```js
window.dispatchEvent(new CustomEvent('kiditem:browser-collection-session', {
  detail: view,
}));
```

- [ ] **Step 4: Add the pre-migration focus regression baseline**

Create `collection-focus-policy.json` with exact current focus-token counts for the enumerated automatic-collector files. The scanner counts `active: true`, `activateTab(`, `bringMallTabToFront(`, `focused: true`, and `window.open(` only in that inventory. These counts may only decrease in later tasks:

```json
{
  "focusOwnerFiles": [
    "extensions/coupang-ads-scraper/background/collection-session.js",
    "extensions/coupang-ads-scraper/background/collection-window.js",
    "extensions/coupang-ads-scraper/background/interactive-tabs.js",
    "extensions/product-scraper/collection-session.js",
    "extensions/product-scraper/interactive-tabs.js",
    "extensions/order-collector/background/collection-session.js",
    "extensions/order-collector/background/interactive-tabs.js"
  ],
  "legacyFocusCounts": {
    "extensions/coupang-ads-scraper/background/service-worker.js": 16,
    "extensions/coupang-ads-scraper/background/coupang-catalog-import.js": 4,
    "extensions/product-scraper/1688-trend-collector.js": 1,
    "extensions/product-scraper/live-commerce-collector.js": 1,
    "extensions/product-scraper/background.js": 0,
    "extensions/order-collector/background/service-worker.js": 26,
    "apps/web/src/components/readiness/useReadinessCollection.ts": 1,
    "apps/web/src/app/(advertising)/ad-ops/hooks/useAdSync.ts": 1,
    "apps/web/src/app/(analytics)/dashboard/page.tsx": 1
  }
}
```

The test fails when a listed automatic-collector count increases. It does not scan unrelated print, inventory, popup, or explicitly interactive UI paths. Later tasks update each migrated legacy file to zero and move approved direct primitives into the owner files only. `collection-window.js` may create an active tab only inside a window it created with `focused: false`; `collection-session.js` may activate/focus only from the explicit open-attention command; `interactive-tabs.js` remains limited to direct user actions.

- [ ] **Step 5: Run adapter and focus-policy tests**

Run:

```bash
rtk node --test extensions/tests/collection-session-adapters.test.mjs
rtk node --test extensions/tests/collection-focus-policy.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
```

Expected: PASS with the three adapter copies byte-identical and the baseline matching the current checkout.

- [ ] **Step 6: Commit the contract adapters and regression baseline**

```bash
rtk git add extensions/shared/collection-session.js \
  extensions/scripts/sync-collection-session-adapters.mjs \
  extensions/coupang-ads-scraper/background/collection-session.js \
  extensions/product-scraper/collection-session.js \
  extensions/order-collector/background/collection-session.js \
  extensions/collection-focus-policy.json \
  extensions/tests/collection-session-adapters.test.mjs \
  extensions/tests/collection-focus-policy.test.mjs
rtk git commit -m "test: guard browser collection focus policy"
```

### Task 4: Synchronize extension sessions into personal web alerts

**Files:**
- Create: `apps/web/src/lib/browser-collection-session.ts`
- Create: `apps/web/src/lib/__tests__/browser-collection-session.spec.ts`
- Create: `apps/web/src/components/providers/BrowserCollectionProvider.tsx`
- Create: `apps/web/src/components/providers/__tests__/BrowserCollectionProvider.spec.tsx`
- Create: `apps/web/src/hooks/useBrowserCollectionSession.ts`
- Create: `apps/web/src/hooks/useBrowserCollectionSession.spec.tsx`
- Create: `apps/web/src/components/browser-collection/BrowserCollectionRunControls.tsx`
- Create: `apps/web/src/components/browser-collection/BrowserCollectionRunControls.spec.tsx`
- Modify: `apps/web/src/components/providers/AuthProvider.tsx`
- Modify: `apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx`
- Modify: `apps/web/src/lib/extension-bridge.ts`
- Modify: `apps/web/src/lib/operation-alerts.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/components/panel/PanelAlertRow.tsx`
- Modify: `apps/web/src/components/panel/__tests__/PanelAlertRow.spec.tsx`

**Interfaces:**
- Consumes: Task 1 session views, Task 2 pending alert lifecycle, existing extension detection helpers, and the always-open authenticated web session.
- Produces: `syncBrowserCollectionAlert(session)`, `recordMissingBrowserCollection(producer, inputIdentity)`, `findBrowserCollectionSession(runId)`, `sendBrowserCollectionControl(runId, action)`, `useBrowserCollectionSession(runId)`, and reusable explicit controls.

- [ ] **Step 1: Write failing pure synchronization tests**

Require run-scoped operation keys, start-on-running, pending-on-attention, terminal updates, metadata without tab IDs, and start-then-update recovery when a terminal event arrives after a page reload.

```ts
it('maps attention_required to one personal pending operation alert', async () => {
  await syncBrowserCollectionAlert(session({
    status: 'attention_required',
    attention: {
      reason: 'marketplace_login',
      message: 'Wing 로그인이 필요합니다.',
      canOpenTab: true,
    },
  }));

  expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({
    operationKey: `browser-collection:${RUN_ID}`,
    type: 'browser_collection',
    sourceType: 'browser_collection_session',
    sourceId: 'dashboard.wing_sales',
  }));
  expect(mockUpdate).toHaveBeenCalledWith(
    `browser-collection:${RUN_ID}`,
    expect.objectContaining({ status: 'pending', severity: 'warning' }),
  );
});
```

- [ ] **Step 2: Run the pure helper test and verify RED**

Run: `rtk npm exec --workspace=apps/web vitest -- run src/lib/__tests__/browser-collection-session.spec.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement operation-alert synchronization and extension lookup**

Add `requireAttentionOperationAlert()` to `operation-alerts.ts`. In the new helper, parse every extension response with `BrowserCollectionSessionViewSchema`, search Coupang, sourcing, and order extensions in parallel, and send only the five Task 1 control commands.

```ts
export const browserCollectionOperationKey = (runId: string) =>
  `browser-collection:${runId}`;

export async function syncBrowserCollectionAlert(
  session: BrowserCollectionSessionView,
): Promise<void> {
  const operationKey = browserCollectionOperationKey(session.runId);
  const metadata = {
    browserCollection: true,
    runId: session.runId,
    producer: session.producer,
    attempt: session.attempt,
    attentionReason: session.attention?.reason ?? null,
  };
  if (session.status === 'running') {
    await startOperationAlert({
      operationKey,
      type: 'browser_collection',
      title: session.producer,
      sourceType: 'browser_collection_session',
      sourceId: session.producer,
      href: '/',
      progress: progressRatio(session.progress),
      metadata,
    });
    return;
  }
  const updated = await updateForSession(operationKey, session, metadata);
  if (!updated) {
    await startOperationAlert({
      operationKey,
      type: 'browser_collection',
      title: session.producer,
      sourceType: 'browser_collection_session',
      sourceId: session.producer,
      href: '/',
      metadata,
    });
    await updateForSession(operationKey, session, metadata);
  }
}
```

`recordMissingBrowserCollection()` creates a UUID, starts the canonical alert, then patches it to `pending` with reason `extension_missing`. It opens no fallback tab.

- [ ] **Step 4: Write failing provider recovery tests**

Test initial authenticated mount, a valid custom event, rejection of malformed events, `online`/visible reconciliation through `listCollectionSessions`, duplicate-tab idempotency, and no synchronization when signed out.

- [ ] **Step 5: Implement the global provider and mount it inside AuthProvider**

`BrowserCollectionProvider` listens for `kiditem:browser-collection-session`, validates `CustomEvent.detail`, and calls `syncBrowserCollectionAlert()`. On mount, `online`, focus, and visible `visibilitychange`, it calls `listCollectionSessions` against all detected extensions and reconciles every returned session.

Wrap authenticated children without changing the existing auth-refresh ownership:

```tsx
return (
  <AuthContext.Provider value={state}>
    <BrowserCollectionProvider enabled={Boolean(state.session)}>
      {children}
    </BrowserCollectionProvider>
  </AuthContext.Provider>
);
```

- [ ] **Step 6: Implement route controls and polling hook with tests**

`useBrowserCollectionSession(runId)` polls every two seconds only while status is `running`. `BrowserCollectionRunControls` renders:

- progress and attempt while running;
- `확인 탭 열기`, `처음부터 재실행`, and `중단` for attention;
- `중단` while running;
- no focus action when `canOpenTab` is false.

The component calls `openCollectionAttentionTab` only from the explicit button click. A `restartStrategy: 'web'` session invokes the required `onWebRestart(session)` callback; an extension strategy sends `restartCollectionSession`.

- [ ] **Step 7: Update panel semantics and tests**

Render pending browser sessions as `확인 필요` with amber styling. Keep generic pending operations as `대기 중`. Hide the server-side operation-cancellation button for `sourceType === 'browser_collection_session'`, because the server cannot push a cancel command into a local browser; the canonical route owns extension cancellation.

- [ ] **Step 8: Run focused web tests and build**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run \
  src/lib/__tests__/browser-collection-session.spec.ts \
  src/components/providers/__tests__/BrowserCollectionProvider.spec.tsx \
  src/components/providers/__tests__/AuthProvider.spec.tsx \
  src/hooks/useBrowserCollectionSession.spec.tsx \
  src/components/browser-collection/BrowserCollectionRunControls.spec.tsx \
  src/components/panel/__tests__/PanelAlertRow.spec.tsx
rtk npm run build --workspace=apps/web
```

Expected: focused suites pass and the Next.js build completes.

- [ ] **Step 9: Commit the global web orchestration**

```bash
rtk git add apps/web/src/lib/browser-collection-session.ts \
  apps/web/src/lib/__tests__/browser-collection-session.spec.ts \
  apps/web/src/components/providers/BrowserCollectionProvider.tsx \
  apps/web/src/components/providers/__tests__/BrowserCollectionProvider.spec.tsx \
  apps/web/src/hooks/useBrowserCollectionSession.ts \
  apps/web/src/hooks/useBrowserCollectionSession.spec.tsx \
  apps/web/src/components/browser-collection/BrowserCollectionRunControls.tsx \
  apps/web/src/components/browser-collection/BrowserCollectionRunControls.spec.tsx \
  apps/web/src/components/providers/AuthProvider.tsx \
  apps/web/src/components/providers/__tests__/AuthProvider.spec.tsx \
  apps/web/src/lib/extension-bridge.ts apps/web/src/lib/operation-alerts.ts \
  apps/web/src/lib/query-keys.ts apps/web/src/components/panel/PanelAlertRow.tsx \
  apps/web/src/components/panel/__tests__/PanelAlertRow.spec.tsx
rtk git commit -m "feat: surface browser collection attention"
```

### Task 5: Convert the Coupang extension to silent collection sessions

**Files:**
- Create: `extensions/coupang-ads-scraper/background/collection-runs.js`
- Create: `extensions/coupang-ads-scraper/background/collection-window.js`
- Create: `extensions/coupang-ads-scraper/background/interactive-tabs.js`
- Create: `extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/collection-runs.test.mjs`
- Create: `extensions/tests/coupang-ads-scraper/collection-window.test.mjs`
- Modify: `extensions/coupang-ads-scraper/background/service-worker.js`
- Modify: `extensions/coupang-ads-scraper/background/coupang-catalog-import.js`
- Modify: `extensions/coupang-ads-scraper/manifest.json`
- Modify: `extensions/tests/coupang-ads-scraper/wing-rank-cancel.test.mjs`
- Modify: `extensions/tests/coupang-catalog-action-coverage.test.mjs`
- Modify: `extensions/collection-focus-policy.json`

**Interfaces:**
- Consumes: `KidItemCollectionSession` from Task 3 and existing producer-specific collectors.
- Produces: generic session-control actions, session events for scheduled and web-started runs, and capability `browserCollectionSessions: true`.

- [ ] **Step 1: Write failing no-focus, attention, and restart tests**

Require all of these behaviors:

- `scrapeTargets` starts the supplied allowlisted producer (use `dashboard.wing_sales` in the test), preserves the user's focused window and active tab, and creates or reuses an extension-owned window with `focused: false`;
- the managed `scrapeTargets` tab is active only inside that extension-owned window, every target navigates sequentially through that one tab, and no parallel target collection is introduced;
- normal completion/cancellation closes the owned collector window, while `attention_required` leaves it available for the explicit open command;
- Wing login/non-JSON responses pause once instead of activating the tab or failing every keyword;
- 429/5xx use bounded retry and then pause without focus;
- catalog login pauses the browser session and stops the alarm step;
- a live tab is reattached after worker reload;
- a lost execution restarts from item zero;
- direct product-edit, thumbnail, and ad-action messages still invoke the separate interactive helper;
- only `openCollectionAttentionTab` focuses a collection tab.

- [ ] **Step 2: Run the focused extension tests and verify RED**

Run:

```bash
rtk node --test extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs
rtk node --test extensions/tests/coupang-ads-scraper/collection-runs.test.mjs
rtk node --test extensions/tests/coupang-ads-scraper/collection-window.test.mjs
rtk node --test extensions/tests/coupang-ads-scraper/wing-rank-cancel.test.mjs
rtk node --test extensions/tests/coupang-catalog-action-coverage.test.mjs
```

Expected: FAIL because the worker has no generic session manager and still activates error tabs.

- [ ] **Step 3: Wire the session manager and generic controls**

Import `collection-session.js` before collector runtimes. Create one manager with storage key `kiditem_collection_sessions` and the committed web origin. Handle these external actions before producer-specific actions:

```js
if (msg.action === 'listCollectionSessions') return respond(collectionSessions.list());
if (msg.action === 'getCollectionSession') return respond(collectionSessions.get(msg.runId));
if (msg.action === 'cancelCollectionSession') return respond(cancelCollectionRun(msg.runId));
if (msg.action === 'openCollectionAttentionTab') return respond(
  collectionSessions.openAttentionTab(msg.runId),
);
if (msg.action === 'restartCollectionSession') return respond(
  restartCollectionRun(msg.runId),
);
```

`restartCollectionRun` dispatches only sessions whose `restartStrategy` is `extension`. It resets progress before resolving current inputs from an existing producer-owned schedule or durable domain run; it never resumes a stored cursor:

- scheduled scrape targets -> reload the current alarm/config targets and call `handleScrapeTargets` from the first URL;
- scheduled Wing sales rank -> reload the current schedule and call `startWingSalesRankCheck({ forceRestart: true })`;
- full catalog -> revalidate the Wing manifest before the server run reuses any accepted chunk.

Web-started dashboard, ad, rank, keyword, and competitor runs use `restartStrategy: 'web'`; their route callback reloads the current source data and starts from item zero. A missing or invalid restart source becomes `attention_required` with `manual_confirmation` instead of replaying stale stored data.

- [ ] **Step 4: Replace collection focus paths with attention transitions**

`handleScrapeTargets` creates or reuses one run-owned collector window through `collection-window.js`. The window is always created with `focused: false`; its one selected tab remains active inside that unfocused window and is navigated sequentially through every target URL. Do not parallelize this path while it depends on page timers and `setDateRange`. Serialize concurrent starts, validate the stored run/window/tab ownership before reuse, close the owned window on success/failure/cancel, and retain it on `attention_required`.

Rank, keyword suggestion, public SERP, competitor catalog, and catalog-import collectors have no documented foreground-timer dependency and continue with inactive tabs. Replace their `activateTab` dependencies with:

```js
await collectionSessions.attachTab(runId, { tabId, windowId: tab.windowId });
await collectionSessions.requireAttention(runId, {
  reason: 'marketplace_login',
  message: '쿠팡 로그인이 필요합니다. 알림에서 확인 탭을 열어 로그인해주세요.',
});
return { success: false, attentionRequired: true, runId };
```

Treat a login/HTML response as a session blocker before the per-keyword loop retries it. Keep item-level invalid data as an item failure only when the same session has already returned valid marketplace data.

- [ ] **Step 5: Isolate deliberate interactive focus**

Move raw `active: true` and `windows.update({ focused: true })` primitives used by product edit, thumbnail registration, ad mutation, and other immediate user actions into `interactive-tabs.js`. Its exported methods require an explicit reason enum and are called only from their existing user-triggered message handlers. The only automatic `active: true` exception is the tab owned by `collection-window.js`; that helper must never focus its window or activate a tab in a user-owned window.

Delete the worker-local `activateTab()` helper. Set the Coupang worker and catalog-import legacy focus counts to zero in `collection-focus-policy.json`.

- [ ] **Step 6: Persist sessions for every automatic Coupang entrypoint**

Use fixed producers:

- dashboard URLs: the validated `msg.producer` among the five dashboard keys;
- ad sweep: `advertising.ad_sync`;
- scheduled scrape targets: `advertising.scrape_targets`;
- Wing rank alarm/button: `advertising.wing_rank`;
- public keyword rank: `advertising.keyword_rank`;
- competitor seller catalog: `advertising.competitor_catalog`;
- full Wing catalog: `channels.coupang_catalog`.

Reject an unrecognized producer before navigation. Store only counts, dates, account/run IDs, and keyword/seller counts in `inputIdentity`; never persist auth tokens or scraped response bodies.

- [ ] **Step 7: Bump capability/version and run the entire Coupang extension suite**

Set manifest version `1.2.32` and advertise `browserCollectionSessions: true`.

Run:

```bash
rtk node --test extensions/tests/*.test.mjs extensions/tests/coupang-ads-scraper/*.test.mjs
rtk node --check extensions/coupang-ads-scraper/background/service-worker.js
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
rtk node --test extensions/tests/collection-focus-policy.test.mjs
rtk git diff --check -- extensions/coupang-ads-scraper extensions/tests extensions/collection-focus-policy.json
```

Expected: all tests pass; focus counts for the Coupang worker and catalog runtime are zero.

- [ ] **Step 8: Commit the Coupang runtime migration**

```bash
rtk git add extensions/coupang-ads-scraper/background/interactive-tabs.js \
  extensions/coupang-ads-scraper/background/collection-runs.js \
  extensions/coupang-ads-scraper/background/collection-window.js \
  extensions/coupang-ads-scraper/background/service-worker.js \
  extensions/coupang-ads-scraper/background/coupang-catalog-import.js \
  extensions/coupang-ads-scraper/manifest.json \
  extensions/tests/coupang-ads-scraper/collection-session-flow.test.mjs \
  extensions/tests/coupang-ads-scraper/collection-runs.test.mjs \
  extensions/tests/coupang-ads-scraper/collection-window.test.mjs \
  extensions/tests/coupang-ads-scraper/wing-rank-cancel.test.mjs \
  extensions/tests/coupang-catalog-action-coverage.test.mjs \
  extensions/collection-focus-policy.json
rtk git commit -m "feat: run Coupang collection silently"
```

### Task 6: Migrate dashboard and Coupang-owned web surfaces

**Files:**
- Create: `apps/web/src/components/readiness/readiness-extension-collection.ts`
- Create: `apps/web/src/components/readiness/readiness-extension-collection.spec.ts`
- Modify: `apps/web/src/components/readiness/useReadinessCollection.ts`
- Modify: `apps/web/src/components/readiness/ReadinessRows.tsx`
- Modify: `apps/web/src/components/ReadinessModal.tsx`
- Modify: `apps/web/src/components/__tests__/ReadinessModal.spec.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(advertising)/ad-ops/hooks/useAdSync.ts`
- Modify: `apps/web/src/app/(advertising)/ad-ops/components/ScrapeCollector.tsx`
- Modify: `apps/web/src/app/(advertising)/rank-tracking/lib/rank-extension.ts`
- Modify: `apps/web/src/app/(advertising)/rank-tracking/lib/rank-extension.spec.ts`
- Modify: `apps/web/src/app/(advertising)/rank-tracking/components/BatchRankCheck.tsx`
- Modify: `apps/web/src/app/(advertising)/rank-tracking/components/BatchRankCheck.spec.tsx`
- Modify: `apps/web/src/app/(advertising)/rank-tracking/components/QuickRankCheck.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx`
- Modify: `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.tsx`
- Modify: `extensions/collection-focus-policy.json`

**Interfaces:**
- Consumes: Task 4 global alert synchronization/controls and Task 5 Coupang session capability.
- Produces: no-focus dashboard readiness, ad sync, rank, competitor, and full-catalog experiences with canonical alert-link recovery.

- [ ] **Step 1: Write failing dashboard orchestration tests**

Require:

- all five readiness keys pass their exact `dashboard.*` producer;
- the extension is detected before start but missing detection creates a personal attention alert and opens no tabs;
- batch status reads `getCollectionSession` by run ID;
- the ad sweep uses `advertising.ad_sync` and a run-scoped alert;
- `collectionRun` opens the readiness modal and renders explicit controls;
- the automatic traffic fallback starts `dashboard.wing_sales` silently;
- source contains no `fallbackOpenTabs` or dashboard `window.open`.

- [ ] **Step 2: Run dashboard/readiness tests and verify RED**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run \
  src/components/readiness/readiness-extension-collection.spec.ts \
  src/components/__tests__/ReadinessModal.spec.tsx
```

Expected: FAIL because readiness still owns bespoke polling and fallback tab opening.

- [ ] **Step 3: Extract and implement one readiness collection orchestrator**

`readiness-extension-collection.ts` accepts `{ check, producer, extensionId, runId }`, sends `scrapeTargets`, then polls `getCollectionSession`. It returns the parsed session and never opens a URL itself. `useReadinessCollection` retains React state, toasts, invalidation, and refetch only.

Remove the duplicate campaign sweep from readiness: `coupang_ads` daily collection finishes, then call the same orchestrator once with `advertising.ad_sync`. Do not maintain a second nested polling implementation.

Keep `rocket_sales` read-only in the readiness UI until its existing order-extension collection path produces persisted dashboard facts; nevertheless its alert link and generic session controls must recognize `dashboard.rocket_sales` when that collector is invoked elsewhere.

- [ ] **Step 4: Replace the dashboard traffic effect and ad sync fallback**

The `needsScrape` effect calls the readiness orchestrator with the current month URL and the existing cooldown. If the extension is missing, call `recordMissingBrowserCollection('dashboard.wing_sales', { trigger: 'dashboard_traffic' })`. Delete every `window.open()` fallback from dashboard and `useAdSync` and set their focus-policy counts to zero.

- [ ] **Step 5: Migrate rank, competitor, and catalog UI controls**

Update Coupang minimum version to `1.2.32`. Keep producer-specific data calls, but use the generic session for focus, attention, restart, and cancel:

```ts
const collectionSession = useBrowserCollectionSession(runIdFromStateOrQuery);

<BrowserCollectionRunControls
  session={collectionSession.data}
  onWebRestart={startFromBeginning}
/>
```

Remove the rank copy that says `중단 지점부터 이어서 수집합니다`; every attention restart says `처음부터 다시 수집합니다`. Catalog domain status continues to display stored/published chunk progress, while the browser control session determines attention and tab focus. Before reusing catalog chunks, the extension's manifest revalidation from Task 5 must pass.

- [ ] **Step 6: Run focused web suites and build**

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run \
  src/components/readiness/readiness-extension-collection.spec.ts \
  src/components/__tests__/ReadinessModal.spec.tsx \
  'src/app/(advertising)/rank-tracking/lib/rank-extension.spec.ts' \
  'src/app/(advertising)/rank-tracking/components/BatchRankCheck.spec.tsx' \
  'src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx'
rtk npm run build --workspace=apps/web
rtk node --test extensions/tests/collection-focus-policy.test.mjs
```

Expected: all focused suites pass, the web build completes, and all three web focus counts are zero.

- [ ] **Step 7: Commit the dashboard and Coupang web migration**

```bash
rtk git add apps/web/src/components/readiness/readiness-extension-collection.ts \
  apps/web/src/components/readiness/readiness-extension-collection.spec.ts \
  apps/web/src/components/readiness/useReadinessCollection.ts \
  apps/web/src/components/readiness/ReadinessRows.tsx \
  apps/web/src/components/ReadinessModal.tsx \
  apps/web/src/components/__tests__/ReadinessModal.spec.tsx \
  'apps/web/src/app/(analytics)/dashboard/page.tsx' \
  'apps/web/src/app/(advertising)/ad-ops/hooks/useAdSync.ts' \
  'apps/web/src/app/(advertising)/ad-ops/components/ScrapeCollector.tsx' \
  'apps/web/src/app/(advertising)/rank-tracking/lib/rank-extension.ts' \
  'apps/web/src/app/(advertising)/rank-tracking/lib/rank-extension.spec.ts' \
  'apps/web/src/app/(advertising)/rank-tracking/components/BatchRankCheck.tsx' \
  'apps/web/src/app/(advertising)/rank-tracking/components/BatchRankCheck.spec.tsx' \
  'apps/web/src/app/(advertising)/rank-tracking/components/QuickRankCheck.tsx' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/lib/coupang-catalog-import.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.ts' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/hooks/useCoupangCatalogImport.spec.tsx' \
  'apps/web/src/app/(product-pipeline)/product-pipeline/registered-products/components/CoupangCatalogImportPanel.tsx' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/lib/competitor-extension.ts' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/competitor-analysis/components/CompetitorTrackingPage.tsx' \
  extensions/collection-focus-policy.json
rtk git commit -m "feat: unify Coupang collection controls"
```

### Task 7: Convert sourcing collectors and their web surfaces

**Files:**
- Create: `extensions/product-scraper/interactive-tabs.js`
- Modify: `extensions/product-scraper/background.js`
- Modify: `extensions/product-scraper/1688-trend-collector.js`
- Modify: `extensions/product-scraper/live-commerce-collector.js`
- Modify: `extensions/product-scraper/manifest.json`
- Modify: `extensions/tests/product-scraper/background-auth.test.mjs`
- Modify: `extensions/tests/product-scraper/1688-trend-collector.test.mjs`
- Modify: `extensions/tests/product-scraper/live-commerce-collector.test.mjs`
- Modify: `apps/server/src/auth/__tests__/sourcing-extension-route-security.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/1688-trend-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/1688-trend-extension.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-commerce-extension.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-commerce-extension.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/LiveCommerceSection.tsx`
- Modify: `extensions/collection-focus-policy.json`

**Interfaces:**
- Consumes: Task 3 adapter and Task 4 web controls/provider.
- Produces: `sourcing.1688_trend` and `sourcing.live_commerce` sessions with CAPTCHA/login attention and fresh-attempt restart.

- [ ] **Step 1: Update sourcing extension tests to require silent attention**

Change the existing verification test to assert the CAPTCHA tab stays inactive, status becomes `attention_required`, and no `tabs.update({ active: true })` occurs until the generic open command. Add a live-commerce login/challenge case and assert initial tab creation uses `active: false`.

- [ ] **Step 2: Run sourcing tests and verify RED**

Run: `rtk node --test extensions/tests/product-scraper/*.test.mjs`

Expected: FAIL because the 1688 collector activates verification tabs and live-commerce creates an active tab.

- [ ] **Step 3: Wire the session adapter and migrate both collectors**

Import `collection-session.js` before collector modules. Add the five generic control actions and capability `browserCollectionSessions: true`.

The 1688 start path uses `sourcing.1688_trend`, safe identity `{ keywordCount, maxResults }`, and `restartStrategy: 'extension'`. CAPTCHA calls `requireAttention`; restart reuses the verified tab only as a browser container but starts the keyword index at zero.

The live-commerce path uses `sourcing.live_commerce`, safe identity `{ source, pageUrl }`, and `restartStrategy: 'web'`. It never stores the extracted broadcast/products or a credential. Its tab is inactive; login/challenge returns an attention session instead of focusing.

Keep the consolidated Supabase extension-auth architecture: `SupabaseAuthMiddleware` applies globally through `forRoutes('*')`, and product-scraper requests use the synchronized Supabase access token. Do not resurrect the deleted scoped-token middleware. Strengthen the route-security regression to prove both 1688 and live-commerce result controllers remain covered by the global middleware.

Move any deliberate popup/manual focus primitive into `interactive-tabs.js`, then set both product collector focus counts to zero.

- [ ] **Step 4: Add sourcing web alert-link controls**

Pass existing run IDs through the extension response, use `useBrowserCollectionSession`, and render `BrowserCollectionRunControls` in both sections. A web-strategy live-commerce restart calls the existing mutation with the current URL. Missing extension attempts call `recordMissingBrowserCollection` instead of only showing a toast.

- [ ] **Step 5: Bump version and run sourcing extension/web gates**

Set product-scraper manifest version `2.2.1`.

Run:

```bash
rtk node --test extensions/tests/product-scraper/*.test.mjs
rtk npm exec --workspace=apps/server vitest -- run src/auth/__tests__/sourcing-extension-route-security.spec.ts
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
rtk node --test extensions/tests/collection-focus-policy.test.mjs
rtk npm exec --workspace=apps/web vitest -- run \
  'src/app/(sourcing-ai)/sourcing-ai/market/lib/1688-trend-extension.spec.ts' \
  'src/app/(sourcing-ai)/sourcing-ai/market/lib/live-commerce-extension.spec.ts'
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
rtk npm run dev:server
```

Expected: all tests pass and the product collector focus counts are zero.

- [ ] **Step 6: Commit sourcing collection sessions**

```bash
rtk git add extensions/product-scraper/interactive-tabs.js \
  extensions/product-scraper/background.js \
  extensions/product-scraper/1688-trend-collector.js \
  extensions/product-scraper/live-commerce-collector.js \
  extensions/product-scraper/manifest.json \
  extensions/tests/product-scraper/background-auth.test.mjs \
  extensions/tests/product-scraper/1688-trend-collector.test.mjs \
  extensions/tests/product-scraper/live-commerce-collector.test.mjs \
  apps/server/src/auth/__tests__/sourcing-extension-route-security.spec.ts \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/1688-trend-extension.ts' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/1688-trend-extension.spec.ts' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-commerce-extension.ts' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-commerce-extension.spec.ts' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx' \
  'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/LiveCommerceSection.tsx' \
  extensions/collection-focus-policy.json
rtk git commit -m "feat: run sourcing collection silently"
```

### Task 8: Convert order collectors without persisting credentials or rows

**Files:**
- Create: `extensions/order-collector/background/interactive-tabs.js`
- Create: `extensions/tests/order-collector-collection-session.test.mjs`
- Modify: `extensions/order-collector/background/service-worker.js`
- Modify: `extensions/order-collector/manifest.json`
- Modify: `extensions/tests/order-collector-action-coverage.test.mjs`
- Modify: `extensions/tests/order-collector-rocket-sales-contract.test.mjs`
- Modify: `apps/web/src/app/(orders)/order-collection/page.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/MallAccountSection.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/components/MallAccountSection.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-collection-extension.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.ts`
- Modify: `extensions/collection-focus-policy.json`

**Interfaces:**
- Consumes: Task 3 adapter and Task 4 global provider/controls.
- Produces: `orders.mall` sessions for every automatic marketplace collection action, while explicit upload/download/mutation actions remain interactive-only.

- [ ] **Step 1: Write failing order session and secret-boundary tests**

Cover these automatic actions: `collectSellpiaDeliTracking`, `collectIcecreamMallOrders`, `collectRocketPoRows`, `listRocketPos`, `collectKidsnoteOrders`, `collectKkomangseOrders`, `collectOnchannelOrders`, `collectDomeggookOrders`, `collectKidkidsOrders`, `collectLotteonOrders`, `collectGsshopOrders`, `collectAlwayzOrders`, `collectKakaoOrders`, `collectBoriboriOrders`, `collectTeachervilleOrders`, `collectArt09Orders`, and `collectCoupangDirectOrders`.

For each, require an `orders.mall` session, inactive tabs, a safe `{ mallKey, date }` identity, and terminal publication. Assert stored session JSON does not contain `password`, `loginId`, `rows`, `xlsxBase64`, `csvBase64`, `fileBase64`, address, phone, or order payload data.

Simulate every `isMallAccessError` path and require one `attention_required` session with no `bringMallTabToFront` call.

- [ ] **Step 2: Run order tests and verify RED**

Run:

```bash
rtk node --test extensions/tests/order-collector-collection-session.test.mjs
rtk node --test extensions/tests/order-collector-action-coverage.test.mjs
rtk node --test extensions/tests/order-collector-rocket-sales-contract.test.mjs
```

Expected: FAIL because the worker has no persisted session adapter and still activates login tabs.

- [ ] **Step 3: Add storage and generic session controls**

Add the `storage` permission, import `collection-session.js`, advertise `browserCollectionSessions: true`, and handle the five generic controls.

Wrap each listed automatic action with one focused helper:

```js
async function runOrderCollectionSession(message, inputIdentity, operation) {
  const runId = validUuid(message.runId) ? message.runId : crypto.randomUUID();
  await collectionSessions.start({
    runId,
    producer: 'orders.mall',
    classification: 'background_preferred',
    restartStrategy: 'web',
    inputIdentity,
  });
  try {
    const result = await operation();
    if (result?.pendingLogin) {
      const session = await collectionSessions.requireAttention(runId, {
        reason: 'marketplace_login',
        message: result.error || '마켓 로그인이 필요합니다.',
      });
      return { ...result, runId, collectionSession: session };
    }
    const session = await collectionSessions.succeed(runId);
    return { ...result, runId, collectionSession: session };
  } catch (error) {
    const session = await collectionSessions.fail(runId, {
      message: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: session.message, runId, collectionSession: session };
  }
}
```

Pass credentials only into `operation()` closure; never into `inputIdentity` or session metadata.

- [ ] **Step 4: Separate interactive actions and remove automatic focus**

Move raw focus used by `sendOrderFileToSellpia`, `openCoupangShipmentPage`, `clickCoupangShipmentDownloads`, `uploadOnchTracking`, and `uploadDomeggookTracking` into `interactive-tabs.js`. Those existing explicit user actions remain active.

Delete `bringMallTabToFront` and replace all login/error calls with `collectionSessions.attachTab()` plus `requireAttention()`. Set the order worker legacy focus count to zero.

- [ ] **Step 5: Add order-route recovery controls**

Read `collectionRun` from the route query and render `BrowserCollectionRunControls` above the mall list. For `restartStrategy: 'web'`, read `inputIdentity.mallKey`, find that account, reload its saved credential through the existing backend helper, and call `handleBrowserCollectMall(account)` from the beginning.

At the top of `handleBrowserCollectMall`, detect the order extension. A missing extension calls `recordMissingBrowserCollection('orders.mall', { mallKey: account.key })` and returns without opening a marketplace tab. Change `ensureMallLoggedInViaExtension` from silent failure to a structured attention result consumed by the page.

- [ ] **Step 6: Bump version and run order extension/web gates**

Set order-collector manifest version `0.1.65`.

Run:

```bash
rtk node --test extensions/tests/order-collector-collection-session.test.mjs \
  extensions/tests/order-collector-action-coverage.test.mjs \
  extensions/tests/order-collector-rocket-sales-contract.test.mjs
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
rtk node --test extensions/tests/collection-focus-policy.test.mjs
rtk npm exec --workspace=apps/web vitest -- run \
  'src/app/(orders)/order-collection/components/MallAccountSection.spec.tsx' \
  'src/app/(orders)/order-collection'
rtk npm run build --workspace=apps/web
```

Expected: all suites pass, no secret material appears in stored session fixtures, and the order worker focus count is zero.

- [ ] **Step 7: Commit order collection sessions**

```bash
rtk git add extensions/order-collector/background/interactive-tabs.js \
  extensions/tests/order-collector-collection-session.test.mjs \
  extensions/order-collector/background/service-worker.js \
  extensions/order-collector/manifest.json \
  extensions/tests/order-collector-action-coverage.test.mjs \
  extensions/tests/order-collector-rocket-sales-contract.test.mjs \
  'apps/web/src/app/(orders)/order-collection/page.tsx' \
  'apps/web/src/app/(orders)/order-collection/components/MallAccountSection.tsx' \
  'apps/web/src/app/(orders)/order-collection/components/MallAccountSection.spec.tsx' \
  'apps/web/src/app/(orders)/order-collection/lib/order-collection-extension.ts' \
  'apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.ts' \
  extensions/collection-focus-policy.json
rtk git commit -m "feat: run order collection silently"
```

### Task 9: Run full repository and live Chrome acceptance

**Files:**
- Modify only if a failing gate exposes an in-scope defect: files already listed in Tasks 1-8.

**Interfaces:**
- Consumes: every prior task.
- Produces: verified PR-ready background collection behavior with no remaining legacy focus allowance.

- [ ] **Step 1: Prove the focus-policy inventory is fully migrated**

Open `extensions/collection-focus-policy.json` and verify every `legacyFocusCounts` value is `0`. Run:

```bash
rtk node --test extensions/tests/collection-focus-policy.test.mjs
```

Expected: PASS. Any nonzero count or new focus token outside a declared owner file blocks completion.

- [ ] **Step 2: Run all shared, server, web, and extension tests**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/browser-collection-session.spec.ts src/schemas/alerts.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/automation
rtk npm exec --workspace=apps/web vitest -- run \
  src/lib src/hooks src/components/providers src/components/panel \
  src/components/readiness \
  'src/app/(advertising)/rank-tracking' \
  'src/app/(advertising)/ad-ops' \
  'src/app/(product-pipeline)/product-pipeline/registered-products' \
  'src/app/(sourcing-ai)/sourcing-ai/market' \
  'src/app/(orders)/order-collection'
rtk node --test extensions/tests/*.test.mjs extensions/tests/coupang-ads-scraper/*.test.mjs
rtk node --test extensions/tests/product-scraper/*.test.mjs
```

Expected: every suite passes with zero failures.

- [ ] **Step 3: Run required builds, schema validation, and server boot**

Run:

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run dev:server
```

Expected: `db:push` reports the database in sync, Prisma generation succeeds, both builds succeed, tenancy guards pass, and NestJS boots without module or provider errors. Stop the development server after confirming boot.

- [ ] **Step 4: Validate extension manifests and syntax**

Run:

```bash
rtk node --check extensions/coupang-ads-scraper/background/service-worker.js
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
rtk node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
rtk git diff --check
```

Expected: every command exits zero.

- [ ] **Step 5: Reload all three unpacked extensions in real Chrome**

Confirm versions `1.2.32`, `2.2.1`, and `0.1.65`. Keep a logged-in KidItem tab open and verify extension auth synchronization remains healthy before collection tests.

- [ ] **Step 6: Verify normal silent collection paths in Chrome**

Run these from their real pages while keeping a different Chrome tab selected:

1. Dashboard Wing sales, ad daily, product list, Item Winner KPI, and ad sweep.
2. Rank Tracking `전체 상품 순위 수집`.
3. Registered Products full Coupang catalog import.
4. 1688 trend and live-commerce collection.
5. At least one order mall and Rocket PO collection.

Expected for every run: no selected-tab or focused-window change, visible progress on the owning page, and one personal running alert in the global alert panel.

For `scrapeTargets` specifically:

1. The user's selected tab and focused window remain unchanged.
2. The collector runs in an extension-owned window created with `focused: false`; its managed tab is active only inside that window.
3. At least three sequential targets complete `setDateRange`; the historical “only first tab succeeds” failure does not recur.
4. Targets remain sequential and reuse the same managed tab; parallel collection is not introduced.
5. No automatic fallback focuses the user's window.
6. If collection cannot proceed without foreground focus, the run becomes `attention_required` instead of stealing focus.
7. Success/cancel closes the owned window; attention retains it until the user explicitly opens or cancels it.

- [ ] **Step 7: Verify attention, explicit focus, restart, and cancellation**

Use a controlled logged-out or challenge page without entering credentials into logs or fixtures.

Expected sequence:

1. The run becomes `확인 필요`; Chrome focus does not change.
2. The alert links to the owning route with `collectionRun=<uuid>`.
3. `확인 탭 열기` selects exactly the managed marketplace tab.
4. After resolving the blocker, `처음부터 재실행` resets progress and increments attempt.
5. `중단` becomes `cancelled`, closes an extension-owned managed tab, and leaves a durable personal alert.
6. A second KidItem user cannot update or dismiss the first user's operation alert.

- [ ] **Step 8: Run PR guards and inspect scope**

Run:

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git status --short
rtk git diff --stat origin/develop...HEAD
```

Expected: PR guards pass; no unrelated files are staged or committed; the changed-file set matches Tasks 1-8.

- [ ] **Step 9: Commit any final in-scope verification fixes**

If Steps 1-8 required a code correction, stage only that task's listed files and commit:

```bash
rtk git commit -m "fix: complete background collection verification"
```

If no correction was required, do not create an empty commit.
