# web/lib - Shared Frontend Utilities

`src/lib/` owns shared frontend utilities: `apiClient`, API base resolution,
query keys, API errors, local-session helpers, extension bridges, download
helpers, formatting utilities, and operation helper APIs. Changes here affect
multiple route groups.

## API Client Rules

- `apiClient` is the only shared path for NestJS API calls.
- JSON calls use `get/post/patch/put/delete`; blob/stream responses use
  `fetchRaw()` and the caller checks `res.ok` or `res.status`.
- `getParsed`, `patchParsed`, and `uploadParsed` surface Zod schema drift at
  the client boundary.
- A Nest handler returning `null` sends a body-less 200. `get` turns that into
  `{}`, which is truthy and slips past a caller's `if (!x)` guard until a
  required field reads back `undefined`. A GET whose handler can return `null`
  uses `getNullable`, which normalizes the empty body to `null`. Do not flip
  the `get` default or re-implement the check at the call site.
- `apiClient` sends the HttpOnly cookie with `credentials: 'include'` and never
  reads or attaches a browser bearer token. It emits `auth_required` and never
  refreshes or retries a 401.

## Query Key Rules

- Add query-key families before sharing query state across components/routes.
- Keep query-key params serializable and explicit.
- Mutations invalidate the narrow domain key first; use broad invalidation only
  when the mutation affects the whole family.

## Browser Integration Rules

- `extension-bridge.ts` owns Chrome extension ID detection, handshakes, and
  runtime messaging helpers.
- Extension IDs may be cached in `localStorage`; extension data itself should
  remain route/domain-owned.
- `auth/browser-auth.ts` owns credential-free same-tab/cross-tab revalidation
  events and one-time removal of the retired localStorage bearer record.
- `extension-auth.ts` owns the explicit, just-in-time extension token handoff;
  no general browser API caller may consume that token.
- `sellpia-inventory-extension.ts` is the only Sellpia inventory command
  adapter. React code passes the claimed token as the extension `runId` and
  never sends extension messages directly.
- `sellpia-inventory-freshness-api.ts` owns freshness leases, browser/manual
  upload, source binding, refresh requests, order-transmission intent
  prepare/finalize/abort calls, unified attempt history, and the authoritative
  latest completed inventory basis read.
- `rocket-confirm-file-store.ts` owns the browser-local Rocket workbook history
  shared by the Supply confirmation workspace and the preserved Orders file
  list. It is operator convenience only, never server truth or provider proof.
- `manual-operation-actions.ts` owns shared Trend and Sellpia manual requests;
  dashboard/domain-screen source metadata may differ but inputs and keys do not.
- `coupang-shipment-summary-action.ts` and
  `rocket-purchase-collection-action.ts` own manual browser actions promoted
  across route groups. Keep extension collection, persistence verification,
  and session terminalization inside these shared boundaries. Each action uses
  its own browser collection producer so both trigger surfaces create one
  identically titled row in the global notification panel.
- `mall-operation-outcomes-api.ts` owns recording mall operation outcomes
  (쇼핑몰 에이전트의 기억). Recording is fire-and-forget and never blocks the
  work; payloads carry counts and reason codes only (no credentials,
  recipients, or order numbers), and the strict contract drops unknown keys.
- `mall-session-probe.ts` owns the passive mall login check (`probeMallSession`)
  and the `sweepMallSessions` round used by the agent loop. It sends only a mall
  key, never credentials, and maps anything unexpected to `unknown`; a stale
  extension is reported as outdated, not absent. The sweep also names the malls
  it found signed out (`signedOutKeys`) so the loop can skip collecting them
  this round; `unknown` never lands in that list.
- `mall-login-block.ts` remembers which malls had an auto-login failure. After
  one failure the agent never logs into that mall again — collection stops with
  a "직접 로그인" notice instead, because retrying locks the operator's account.
  The block clears only when the operator's own session is observed
  (`signed_in`) or a login test succeeds. Only a real credential rejection
  blocks: an extension that did not answer in time
  (`EXTENSION_TIMEOUT_MESSAGE`) is not a wrong password, and blocking on it
  freezes a perfectly signed-in mall as "직접 로그인 필요" — the operator then
  reads "log in" on a mall they are already logged into. A screen that shows a
  confirmed `signed_in` never shows a login block beside it.
- `mall-agent-loop.ts` holds the agent loop's settings, schedule, and last-round
  state. The runner that acts on it lives in `hooks/use-mall-agent-loop.ts`.

## Boundary Rules

- Do not import route-local files into `src/lib`.
- Keep generic utilities small; domain helpers belong in route-local `lib/`
  until at least two route groups need them.
