# Universal Extension Environment Context Design

## Status and Authority

Approved by the user in the design conversation on 2026-07-25.

This change is classified as a cross-layer authentication and browser-platform
boundary. It may cross the shared web authentication bridge, the three Chrome
extensions, extension release automation, and their regression tests because
those surfaces jointly own environment selection and extension authentication.
It must not change unrelated sourcing, advertising, order, inventory, or
marketplace behavior.

The design does not change persisted application schema or data. It requires no
root `VERSION` change, database migration, or backfill. Every changed extension
must increase its own manifest version because its runtime behavior and browser
contract change.

## Context

KidItem currently treats committed extensions as local-development variants and
creates staging artifacts by copying each extension and rewriting KidItem web
and API origins. This produces separate packages even though the marketplace
collectors are otherwise identical.

The current extensions are uneven:

- `product-scraper` already accepts a bounded API base from the KidItem web app,
  but stores one global token and API base;
- `coupang-ads-scraper` allows the staging web bridge but still embeds local API
  constants in its service worker, popup, content scripts, and API helper;
- `order-collector` does not call KidItem APIs directly, but its web callbacks,
  schedules, and persisted collection state still need an owning environment.

A single global “last environment” cannot support a local and staging tab in the
same Chrome profile. Auth refreshes, alarms, service-worker restarts, and
concurrent collections could redirect a request or result to the wrong API.

## Operating Assumptions

- Supported KidItem web origins are exactly `http://localhost:3000` and
  `https://staging.merchon.org`.
- Their API origins are exactly `http://localhost:4000` and
  `https://staging.merchon.org`, respectively.
- Local and staging may use different Supabase sessions and access tokens.
- Both KidItem web tabs may remain open and logged in simultaneously.
- Chrome, network access, and any required marketplace sessions remain explicit
  runtime prerequisites.
- Production origin support is a later allowlist addition, not a wildcard or an
  inferred URL.

## Goals

- Load one copy of each extension and use it from local and staging KidItem tabs.
- Keep authentication, API requests, execution state, schedules, and callbacks
  bound to the environment that created them.
- Allow local and staging collections to run concurrently without cross-routing.
- Preserve environment ownership across Manifest V3 service-worker restarts.
- Remove environment-specific source copying and URL rewriting from extension
  release packaging.
- Fail closed when environment ownership cannot be proved.

## Non-goals

- Supporting arbitrary KidItem domains or client-provided API URLs.
- Storing Supabase refresh tokens in extensions.
- Sharing one environment's access token with another environment.
- Migrating ambiguous legacy tokens or in-flight runs to a guessed environment.
- Changing marketplace credentials, sessions, collection algorithms, or
  destructive-action confirmation policy.
- Publishing to Chrome Web Store as part of this change.
- Adding production origins before the production web/API contract is reviewed.

## Considered Approaches

### Origin-bound environment context — selected

Resolve the environment from the verified external message sender, store auth
profiles per environment, and require every run and schedule to carry its owner.
This supports simultaneous use and survives service-worker restarts without a
global mutable API target.

### Global last-used environment

Store one API base and token and overwrite them whenever a KidItem tab syncs.
This is smaller but creates a race between local and staging auth events and can
send background results to the wrong environment. It is rejected.

### Separate local and staging extension identities

Build and load two variants with different IDs. This isolates environments but
retains the duplicate packaging and operator burden that this design removes. It
is rejected.

## Environment Contract

The extension owns a closed mapping. Web messages never provide a trusted API
base.

| Environment ID | Web origin | API origin | Web tab pattern |
|---|---|---|---|
| `local` | `http://localhost:3000` | `http://localhost:4000` | `http://localhost:3000/*` |
| `staging` | `https://staging.merchon.org` | `https://staging.merchon.org` | `https://staging.merchon.org/*` |

Each extension exposes an environment-context module with a small public
contract:

- resolve an `environmentId` from `chrome.runtime.MessageSender`;
- reject senders outside the exact web-origin allowlist;
- read, update, and clear the access token for one environment;
- return the fixed API origin and web-tab pattern for an environment;
- create authenticated requests that require an explicit `environmentId`;
- locate only the owning environment's KidItem tabs for auth recovery and
  collection callbacks.

The authenticated extensions store profiles under one versioned extension-local
key shaped as:

```text
kiditem_environment_profiles_v1
  local
    accessToken
    updatedAt
  staging
    accessToken
    updatedAt
```

The mapping itself remains code, not storage. Stored values cannot introduce a
new origin. `order-collector` uses the same environment resolution and ownership
contract without storing a KidItem access token.

The extensions advertise `kiditemEnvironmentProfilesV1: true` in `ping`.
The web requires this capability for the new environment-aware flow and reports
an extension reload requirement for an older build rather than falling back to a
global token.

## Web Authentication Flow

`AuthProvider` remains the only Supabase refresh owner. On initial session,
sign-in, token refresh, online recovery, visibility recovery, and sign-out, the
web synchronizes the current session to each authenticated extension.

The external message includes the action and current access token only. The
extension derives the environment from `sender.url` and stores or clears only
that profile. A local sign-out cannot clear staging auth, and a staging refresh
cannot overwrite local auth.

When an API call receives `401`, the extension:

1. records the failed token for the run's environment;
2. requests auth recovery only from tabs matching that environment;
3. waits for only that environment profile's token to change;
4. retries the original request once with the new token;
5. marks only that run `attention_required` after a second `401` or timeout.

No token is placed in a DOM event, page-world message, URL, log, or error text.

## Execution and Schedule Ownership

Every web-originated command resolves `environmentId` before any work begins.
The extension persists it in the collection session or scheduled-work record
alongside `runId`. All later API requests, web callbacks, auth recovery, progress
publication, cancellation, and terminal results require that stored owner.

Storage keys, alarm identities, and non-run-scoped status records that can exist
for both environments are namespaced by `environmentId`. Run-scoped records keep
their existing `runId` identity and add the required environment field. Existing
collector-specific concurrency and destructive-action gates remain in force;
environment separation does not authorize duplicate or unsafe marketplace
actions.

Marketplace content scripts receive only the sanitized operation input and run
identity needed for their collector. They do not receive KidItem access tokens
or an arbitrary backend URL. The extension service worker owns the environment
context and result routing.

After a service-worker restart, a live persisted run reloads its environment
owner before reattaching. A run or schedule without a valid environment owner is
not resumed.

## Popup and Extension-Origin Actions

A popup or extension page has no KidItem web sender from which to derive an
environment. It therefore follows an explicit selection policy:

- when exactly one environment is connected, display and use that environment;
- when both environments are connected, require the operator to select the
  target for that action;
- when neither is connected, ask the operator to open and sign in to a supported
  KidItem environment;
- never persist the selection as a global fallback for later commands.

Interactive marketplace actions continue to require their existing user
confirmation. Environment selection does not weaken action validation.

## Extension-specific Changes

### `product-scraper`

- Replace the global `apiBase` and common token key with environment profiles.
- Derive the sourcing endpoint as
  `<environment API origin>/api/sourcing/extension`.
- Bind sourcing and trend runs to the sender environment.
- Restrict auth-refresh tab lookup to the owning environment.

### `coupang-ads-scraper`

- Remove hard-coded KidItem API constants from the service worker, popup,
  advertising content script, and API helper.
- Route every KidItem request through an environment-aware API client.
- Add the exact staging API host permission to the committed universal manifest
  while retaining the reviewed localhost permissions.
- Bind collection windows, catalog imports, rank jobs, ad synchronization,
  progress publication, and alarms to their owning environment.

### `order-collector`

- Resolve and persist environment ownership for web commands, schedules,
  collection sessions, and callbacks.
- Keep marketplace credentials and order artifacts under the existing boundary;
  do not add a KidItem access token solely for environment selection.
- Keep both exact KidItem web origins in `externally_connectable` and the host
  bridge content-script matches. Do not add a KidItem API host permission because
  this extension does not call KidItem APIs directly, and do not broaden
  marketplace permissions.

## Failure Semantics

| Condition | Required behavior |
|---|---|
| Unknown external sender | Reject with `forbidden_origin`. |
| Missing environment profile | Return `environment_auth_required` for that environment. |
| Client-provided API URL | Ignore or reject it; use the closed mapping only. |
| Initial KidItem `401` | Refresh through the owning environment and retry once. |
| Second `401` or refresh timeout | Mark only the owning run `attention_required`. |
| Environment API unavailable | Fail or retry under existing bounded policy; never use another environment. |
| Legacy global token | Remove it and require a fresh web synchronization. |
| Legacy run or alarm without owner | Do not resume; require a new run. |
| Both environments connected in popup | Require explicit selection for that action. |
| No connected environment in popup | Block and show login/open-tab guidance. |

There is no `model || default`-style environment fallback and no “last active
environment” inference.

## Migration and Compatibility

On extension update, each authenticated extension removes the ambiguous legacy
`kiditem_auth_token` and any superseded API-base storage. Existing legacy sourcing
token keys continue to be removed. The first local or staging web refresh writes
the new environment profile.

Persisted legacy collection sessions, alarms, or status records without a valid
environment owner are cancelled, expired, or surfaced as requiring a fresh run
according to the existing collector lifecycle. They are never silently assigned
to local or staging.

The web capability gate makes the rollout explicit. An old unpacked extension
continues to be reported as outdated until the operator reloads the universal
build.

## Manifest and Release Model

Each committed manifest contains both exact KidItem web origins for its external
message and host-bridge boundary. Authenticated extensions also contain both
exact API origins in their host permissions. `order-collector` does not gain API
host permission. No manifest may use `<all_urls>` or a broad KidItem wildcard.

Release packaging copies all three loadable extensions, removes agent
documentation, creates one deterministic archive containing three top-level
extension directories, and reports every manifest version with the Git SHA. It no longer rewrites web/API origins or emits
environment-targeted runtime variants.

New releases use the staging deployment tag and the output path
`output/extensions/bundles/<deployment-tag>/`. One GitHub Release contains one
universal ZIP asset with all three independently versioned extension
directories. Existing extension-specific releases remain historical artifacts;
the public distribution contract no longer creates them.

Chrome Web Store publication remains outside this implementation. The universal
archive is suitable for a future private Store item after listing, privacy, and
review requirements are completed.

## Security Properties

- Exact manifest and runtime sender allowlists define trusted KidItem origins.
- API origins come only from the compiled environment mapping.
- Access tokens remain environment-scoped and extension-local.
- Supabase refresh tokens remain owned by the web session.
- Marketplace page-world bridges never receive KidItem tokens or backend URLs.
- One environment's logout, `401`, timeout, or malformed message cannot mutate
  another environment's profile or run.
- Logs, errors, alerts, and release metadata contain no tokens, cookies, or
  marketplace credentials.

## Testing

Web tests cover:

- local and staging auth synchronization without a client-trusted API base;
- token refresh and sign-out isolation;
- the `kiditemEnvironmentProfilesV1` capability gate;
- simultaneous extension discovery and commands from both origins.

Extension tests cover:

- exact sender-to-environment resolution and unknown-origin rejection;
- environment-specific token storage, clearing, bearer use, and `401` recovery;
- concurrent local and staging requests reaching only their mapped API origins;
- required environment ownership on runs, status records, callbacks, and
  schedules;
- alarm and storage namespacing;
- service-worker restart recovery with the same environment;
- legacy-token and ownerless-run rejection;
- popup behavior for zero, one, and two connected environments;
- manifest permissions and the universal `ping` capability.

Release-script tests cover:

- one reproducible archive containing all three extensions;
- no environment-specific origin rewriting;
- one manifest under each top-level extension directory;
- Git SHA, manifest versions, and deployment tag in command output;
- preservation of reviewed non-KidItem permissions.

Required automated verification:

```bash
node --test extensions/tests/*.test.mjs
npm run test:scripts
npm run check:scripts-inventory
npm run build --workspace=apps/web
node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
git diff --check
```

## Manual Acceptance

1. Load each committed extension directory once through `chrome://extensions`.
2. Open and sign in to local and staging KidItem in the same Chrome profile.
3. Confirm both pages discover the same installed extension ID and advertise
   `kiditemEnvironmentProfilesV1`.
4. Start a safe read-only collection from each environment concurrently.
5. Confirm local work calls only `http://localhost:4000` and staging work calls
   only `https://staging.merchon.org`.
6. Sign out of one environment and confirm the other environment still operates.
7. Create or inspect automatic collection state in both environments and confirm
   their progress, auth recovery, alerts, cancellation, and results never cross.
8. Restart the extension service worker and confirm both owned runs recover with
   their original environments.

## Blockers

Stop implementation or rollout if:

- an authenticated request can be issued without an explicit environment;
- a web message can introduce an arbitrary API origin;
- a token refresh queries tabs from both environments;
- an ownerless legacy run would be assigned to a guessed environment;
- local and staging storage/alarm identities collide;
- a staging failure falls back to localhost or a local failure falls back to
  staging;
- a page-world message, URL, log, or alert exposes a KidItem token;
- the universal manifest requires a broad host permission to pass tests.
