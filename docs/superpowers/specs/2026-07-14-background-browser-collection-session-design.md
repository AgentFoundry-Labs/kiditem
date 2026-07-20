# Background Browser Collection Session Design

## Status and Authority

Approved by the user in the design conversation on 2026-07-14.

This design is a browser-automation platform-boundary cleanup within PR #327.
It may cross dashboard readiness, automation alerts, shared contracts, and the
three Chrome extensions because those surfaces jointly own browser collection
execution. It must not change unrelated advertising, sourcing, order, or
channel business behavior.

For tab visibility, human-attention handling, and generic browser restart
behavior, this design supersedes older collector-specific behavior. It does
not replace a domain import's server-side completeness or publication rules.

The design does not require a persisted schema change. Alert statuses are
already stored as strings, and the implementation extends their shared/domain
validation and lifecycle behavior. No `VERSION` bump, data migration, or
backfill is required.

## Context

KidItem browser collectors do not follow one tab-visibility or failure policy.
Some collectors create inactive tabs and windows, while others activate a tab
when login, throttling, an unexpected response, or a first-page error occurs.
The Wing rank collector can consequently switch the user's selected tab many
times because a session-level failure is retried as if it were an independent
keyword failure. The full catalog collector already uses an unfocused managed
window and stops the run on a fatal session error.

The dashboard readiness flow adds another set of behaviors:

- `wing_sales`, `rocket_sales`, `coupang_ads`, `coupang_products`, and
  `wing_kpi` use extension collection URLs;
- the separate advertising synchronization row starts another browser sweep;
- missing extensions currently fall back to opening every target URL;
- the dashboard automatically calls `window.open()` for Wing sales analysis
  when traffic data is missing.

These differences make unattended work disruptive and make progress or
required intervention difficult to understand. The user requires all
automatic collectors to run silently, with personal persistent alerts when a
human must intervene. A collector may focus a marketplace tab only after the
user explicitly requests it.

Chrome creates a tab as active unless `active: false` is specified, can create
an unfocused window with `focused: false`, throttles timers in background tabs,
and may terminate an extension service worker between events. The execution
contract must therefore make inactive execution explicit and persist control
state outside service-worker memory.

References:

- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)
- [Extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Background tab throttling](https://developer.chrome.com/blog/background_tabs)

## Operating Assumptions

- Chrome is running.
- At least one KidItem web tab remains open and logged in.
- Supabase access-token refresh remains owned by the KidItem web session and
  synchronized to extensions that call KidItem APIs.
- The relevant extension is installed and enabled.
- External marketplace sessions may still expire and require a human.
- Chrome shutdown, computer sleep, disabled extensions, missing KidItem tabs,
  network outages, marketplace authentication, CAPTCHA, and permission prompts
  are explicit blockers, never silent successes.

## Goals

- Make every automatic browser collector silent by default.
- Use one collection-session state and command contract across extensions.
- Persist enough control state to survive service-worker restarts.
- Never activate a tab or focus a window automatically on an error path.
- Pause a run once for a session-level blocker instead of repeating the same
  failure for every item.
- Create a durable personal alert for the user who started or owns the run.
- Keep one alert row through running, attention, restart, and terminal states.
- Let the user explicitly open the managed marketplace tab, restart the
  collection from the beginning, or cancel it.
- Include every dashboard readiness collection path and all other automatic
  sourcing, advertising, catalog, order, and shipment collectors.
- Add a regression gate that prevents a collector from reintroducing automatic
  tab activation without an explicit interactive-only classification.

## Non-goals

- Moving browser collection into a server-only queue.
- Running after Chrome or the always-open logged-in KidItem tab closes.
- Bypassing marketplace authentication, CAPTCHA, or anti-automation controls.
- Making interactive product editing, thumbnail registration, advertising
  mutation, file upload, or destructive actions run invisibly.
- Giving the order collector a KidItem API token solely for alert reporting.
- Introducing a universal data cursor that resumes a volatile marketplace
  result set from an old product, keyword, page, or date position.
- Making all collectors use the same extraction algorithm or marketplace tab.

## Considered Approaches

### Patch foreground calls individually

Remove each `active: true`, `activateTab()`, or `window.open()` occurrence in
place. This is initially small but leaves retry, attention, state recovery, and
alert behavior duplicated and allows the extensions to drift again.

### Shared execution contract with extension-local adapters — selected

Define one state, message, persistence, attention, and focus policy. Each
extension implements a small local adapter because unpacked extensions have
separate loadable roots and no common runtime bundle. Shared schemas and
regression tests keep the adapters compatible without adding a new extension
build system.

### Server-central browser command queue

Make NestJS own all schedules and commands while extensions poll for work.
This gives stronger central orchestration but cannot remove the dependency on
the user's browser and marketplace sessions. It is unnecessary for the
approved always-open web-tab model and would create a much larger security and
operations boundary.

## Collection Classification

Every browser operation receives one classification:

1. `background_safe`: API or in-page fetch/DOM collection is expected to work
   in an inactive tab.
2. `background_preferred`: start inactive, but background throttling or a
   marketplace challenge may require `attention_required`.
3. `interactive_only`: a user explicitly opens and operates the tab. Product
   edits, thumbnail registration, advertising mutations, file uploads, and
   other immediate user actions belong here.

Only the first two classifications are collection sessions. An
`interactive_only` exception must live in the collector inventory with a
reason; an arbitrary inline focus call is not an exception.

## Architecture

```text
web action or schedule
  -> collection-session producer
       -> extension-local CollectionSession adapter
            -> inactive managed tab/window
            -> marketplace collector
            -> persisted control state in chrome.storage.local
       -> authenticated Operation Alert lifecycle
            -> personal Alert(actorUserId)
            -> global alert panel
            -> owning KidItem route with explicit controls
```

### Shared collection-session contract

The shared contract defines:

- `runId`, `producer`, `collectorKind`, `classification`, and sanitized input
  identity;
- `idle`, `running`, `attention_required`, `succeeded`, `failed`, and
  `cancelled` states;
- progress counts and a user-safe current label;
- managed tab/window identity stored only in the extension;
- attention reason, retry attempt, timestamps, and terminal summary;
- start, inspect, cancel, open-attention-tab, and restart-from-beginning
  commands.

`runId` is unique per logical execution. Its operation key is run-scoped so a
new execution creates a new durable alert, while every transition of that run
updates the same alert.

Each extension keeps the same state shape and commands in a focused local
module. Collector code reports events through that module rather than calling
Chrome focus APIs or alert APIs directly.

### Persisted control state, not a data checkpoint

The adapter persists only execution control information: run identity, input,
status, managed tab/window IDs, progress for display, attention reason, and
attempt count. It does not provide a generic product/page/date cursor.

- If the service worker restarts while the managed tab is still executing, the
  adapter reattaches to that live tab.
- If collection execution itself stopped, the next attempt starts the whole
  collector from the beginning and resets displayed progress.
- Human intervention never resumes from an old marketplace position.
- A partial attempt is not labeled as a completed run.
- Incremental writers use their existing domain identity or attempt fence so a
  full retry is idempotent where the domain requires it.

A specialized server-owned snapshot import may retain already validated
durable chunks only when its own manifest-stability and completeness contract
proves that they still belong to the same snapshot. That is domain staging,
not a browser-session checkpoint. The common controller never assumes such
chunks are reusable and defaults to a fresh attempt. Before a full-catalog
attempt reuses a server chunk, it must revalidate the source manifest; a
changed or unprovable manifest discards the old attempt instead of mixing it
with current marketplace data.

### Personal Operation Alerts

The existing Automation-owned Alert and OperationAlert lifecycle remains the
durable notification owner. `attention_required` maps to the persisted alert
status `pending`, severity `warning`, and metadata that identifies a browser
attention reason. The alert panel renders this case as `확인 필요` rather than
the generic pending label.

The alert is personal: the server derives `actorUserId` and `organizationId`
from authenticated context and never accepts either as trusted extension
input. Web-initiated and web-scheduled runs use the logged-in web tab for alert
API calls. An authenticated extension-owned producer may call the same
operation endpoint with its synchronized Supabase access token. An extension
that otherwise needs no KidItem token reports lifecycle events through the
always-open web tab instead of receiving a new credential.

The alert stores only safe metadata such as producer, collector kind, counts,
phase, attempt, and attention reason. Browser tab IDs remain local to the
extension and are resolved by `runId` when the user requests an action.

## Execution Flow

1. A web action or schedule creates a `runId`, persists the session, and starts
   its personal Operation Alert.
2. The adapter creates or reuses a managed tab with `active: false`; a managed
   window uses `focused: false`.
3. The collector reports progress to the adapter. Alert progress is coalesced
   rather than updated for every row.
4. Transient failures use bounded retry without focus.
5. A login page, CAPTCHA, permission prompt, repeated `401`, or required manual
   confirmation pauses the whole session as `attention_required` and updates
   the existing alert once.
6. Clicking the alert navigates to the owning KidItem route. It does not focus
   the marketplace tab by itself.
7. The route displays `확인 탭 열기`, `처음부터 재실행`, and `중단` as applicable.
8. Only `확인 탭 열기` sends the extension command that activates the managed
   tab and focuses its containing window.
9. After the user resolves the blocker, `처음부터 재실행` starts a new attempt
   under the same run and alert, resets progress, and recollects current data.
10. Completion, failure, or cancellation updates the same alert and cleans up
    managed tabs when the collector owns their lifecycle.

## Authentication Behavior

KidItem access-token refresh follows the existing extension authentication
continuity contract. An authenticated extension request that receives `401`
asks an open KidItem tab for the current session, waits for token
synchronization, and retries exactly once. A second `401`, a missing web tab,
or a refresh timeout becomes `attention_required`; it never creates a retry or
focus loop.

Marketplace authentication is separate. A valid KidItem token cannot make a
Wing, advertising, supplier, 1688, or other marketplace session valid.
Marketplace login and CAPTCHA always follow the attention flow.

## Dashboard Coverage

The dashboard is an explicit acceptance surface, not a later migration. The
implementation covers:

- Wing daily sales (`wing_sales`);
- Rocket sales (`rocket_sales`), even though its current readiness row is
  read-only;
- Coupang advertising daily data (`coupang_ads`);
- Coupang registered products (`coupang_products`);
- Wing Item Winner KPI (`wing_kpi`);
- the separate campaign/product advertising synchronization sweep;
- the traffic-data fallback that currently opens Wing sales analysis from a
  dashboard effect.

The `fallbackOpenTabs()` missing-extension behavior is removed. The run enters
`attention_required` and its personal alert tells the user to install, enable,
or reload the relevant extension. No dashboard effect or readiness action may
open multiple tabs as a fallback.

## Error and Recovery Semantics

| Condition | Required behavior |
|---|---|
| Network interruption, `429`, transient `5xx` | Bounded exponential backoff; stay inactive |
| Background timer delay | Apply a collector-specific deadline; do not focus or immediately fail |
| Marketplace login, CAPTCHA, permission, manual confirmation | Pause the whole run once as `attention_required` |
| KidItem `401` | Refresh handshake and one retry; then `attention_required` |
| Session-level non-JSON/login response | Pause the run; do not repeat per item |
| One invalid item with a healthy session | Record the item failure and continue when the domain allows partial results |
| Contract or selector drift | Fail explicitly with sanitized diagnostics |
| Service worker restarts with live tab | Reattach and continue observing the live execution |
| Execution disappeared | Restart inactive from the beginning when the bounded retry policy permits; otherwise require attention |
| User cancels | Set a cooperative abort flag, stop between safe units, clean up, and mark `cancelled` |
| Extension missing or disabled | `attention_required` personal alert; open no fallback tabs |

No error branch may call `tabs.update({ active: true })`, create an active tab,
focus a window, or use `window.open()` to attract attention.

## User Experience

- The owning page shows the active run, progress, current phase, attempt, and
  whether it is waiting for the user.
- `attention_required` uses an explicit `확인 필요` label and explains the
  blocker without exposing tokens or raw marketplace responses.
- The alert remains in the global alert panel until the user dismisses it.
- A terminal alert links back to the owning route and retains its final counts.
- Start controls are disabled or attached to the active run so duplicate clicks
  do not create concurrent sessions for the same collector scope.
- Toasts may give immediate feedback but are not the durable source of truth.

## Regression Controls and Testing

### Shared and extension tests

- validate every state and command payload;
- cover running to attention, fresh attempt, success, failure, and cancel;
- prove a service-worker restart reattaches to a live tab;
- prove a lost execution restarts from the beginning rather than a stored
  cursor;
- prove a session-level blocker produces one pause and one alert update;
- prove transient retries never activate or focus a tab;
- prove cancellation is cooperative and terminal;
- mock Chrome APIs and fail if an automatic collector requests active/focused
  creation or update.

### Static focus-policy gate

A repository check inventories automatic collector modules and rejects direct
tab/window activation calls. `interactive_only` modules must be allowlisted
with a documented reason. The gate covers all three extensions and dashboard
`window.open()`/fallback paths.

### Server and web tests

- accept `pending` in operation lifecycle transitions and render it as
  browser `확인 필요` when metadata identifies attention;
- derive personal ownership from authenticated context;
- reject cross-organization run or alert access;
- keep one alert per `runId` through all transitions;
- route alert clicks to the canonical owning page without focusing Chrome;
- expose the explicit open-tab, restart-from-beginning, and cancel controls;
- cover all dashboard readiness keys, the advertising sweep, missing extension,
  and traffic fallback;
- prove missing extensions do not open fallback tabs.

### Live Chrome acceptance

Reload the unpacked extensions, then verify in the user's real Chrome profile:

1. Start Wing rank and full-product collection and confirm the selected tab
   never changes automatically.
2. Start each dashboard collection path and the advertising sweep; confirm
   progress appears on the owning page and in a personal alert.
3. Trigger a controlled attention condition; confirm the run pauses and no tab
   receives focus.
4. Click `확인 탭 열기`; confirm only this explicit action selects the managed
   marketplace tab.
5. Resolve the condition and restart; confirm progress returns to zero and the
   collector reads current data from the beginning.
6. Cancel a run and confirm it stops, cleans up, and leaves a durable cancelled
   alert.
7. Verify another user does not receive or control the personal run alert.

Required repository verification includes focused shared, automation, web,
and extension tests; extension manifest/syntax checks; `npm run dev:server`
with confirmed NestJS boot; and `npm run build --workspace=apps/web`. Because
this design adds no persisted schema, it does not add a new schema gate; PR
#327's existing schema verification remains required for its other changes.

## Rollout

1. Add the shared session contract and focus-policy regression gate before
   deleting existing focus calls.
2. Extend Operation Alert and the global alert panel with browser attention.
3. Add the web orchestration controls and convert every dashboard path.
4. Convert Coupang advertising/rank/catalog collectors.
5. Convert sourcing and order/shipment collectors.
6. Run focused automated gates and live Chrome acceptance across the complete
   collector inventory.
7. Remove obsolete per-collector focus helpers and multi-tab fallbacks only
   after their replacements pass.

This sequence is one platform-boundary implementation, not deferred follow-up
issues. Interactive-only operations remain deliberately outside the automatic
collector inventory.

## Acceptance Criteria

1. No automatic collector changes the user's selected tab or focused window.
2. Every dashboard data-collection path follows the common session contract.
3. Missing extensions, marketplace authentication, CAPTCHA, and manual
   confirmation create a persistent personal `확인 필요` alert without opening
   or focusing tabs.
4. Only an explicit user click opens and focuses a managed marketplace tab.
5. A fresh attempt after interruption begins from current marketplace data,
   not a generic stored cursor.
6. Service-worker restart does not lose control of a still-running managed
   tab.
7. Session-level failures stop once instead of repeating for every product,
   keyword, page, or date.
8. Progress, cancel, attention, retry, and terminal state remain visible on the
   owning page and in one durable alert per run.
9. Personal alerts and actions cannot cross user or organization boundaries.
10. The static gate prevents unclassified collector focus behavior from being
    reintroduced.
