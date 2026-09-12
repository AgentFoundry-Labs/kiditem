# Client Detail-Page Raster Design

## Status and Authority

Approved by the user in the design conversation on 2026-07-26.

This change is classified as a cross-layer browser-platform and storage
boundary. It may cross the collected-product Wing registration flow, AI
detail-page APIs and persistence, shared contracts, the Coupang Chrome
extension, and their focused tests because those surfaces jointly own creation,
storage, and consumption of the single Wing detail image. It must not change
unrelated sourcing, advertising, inventory, order, or marketplace behavior.

The implementation is expected to add compatible schema and storage contracts.
It requires no backfill: existing server-rendered artifacts remain readable,
while newly generated client artifacts use a new variant. The root release
train version remains unchanged unless the implementation begins a later train
under the release runbook. The Coupang extension manifest version must increase
because its permissions and runtime capabilities change.

## Context

Wing direct registration requires one vertically long JPEG derived from the
saved detail-page revision. The current server worker launches Chromium,
captures the full document, writes the image to object storage, and exposes the
stored URL to the Coupang extension.

That design does not fit the current staging host. On 2026-07-26, the exact
saved revision `60620087-f5d8-4307-8591-221fd018eaa0` was tested on staging with
an implementation that replaced one long screenshot with bounded 4096-output-
pixel screenshots and server-side stitching. The job retried three times and
failed after approximately 10 minutes 19 seconds with
`Page.captureScreenshot timed out`. A direct staging render also returned an
error after approximately 126 seconds. The deployment was rolled back.

The same document renders successfully on a company computer using local
Chrome. Wing registration already requires the company-managed Coupang Chrome
extension and an authenticated KidItem tab. The selected design therefore
moves rasterization and JPEG encoding to that Chrome instance while keeping
authorization, revision selection, durable storage, and artifact identity on
the server.

## Operating Assumptions

- Wing direct registration runs from a company-managed desktop Chrome profile.
- The current Coupang extension is installed, connected to the originating
  KidItem environment, and required for the existing Wing form-fill flow.
- Supported KidItem environments remain the closed environment mapping owned by
  the universal extension environment context.
- A saved `DetailPageRevision` is mandatory. The renderer never substitutes a
  representative image or a collection of section images.
- Wing receives exactly one JPEG URL for the detail description.
- Object storage is reachable from the company browser through an exact,
  reviewed upload-origin allowlist.
- The browser and its KidItem tab remain available until capture and upload
  finish. A later Mac mini worker may assume this renderer role without changing
  artifact identity or Wing registration contracts.

## Goals

- Remove Chromium screenshot and JPEG encoding work from the small application
  server for Wing registration.
- Produce one 780-pixel-wide JPEG without scrolling, tiling, or stitching.
- Upload the binary directly from Chrome to object storage; do not relay it
  through the NestJS process.
- Reuse a valid stored artifact immediately for an unchanged revision and
  output variant.
- Make capture, upload, and finalization idempotent and safely retryable.
- Preserve organization and revision boundaries at every server mutation.
- Provide explicit progress and actionable failures instead of an indefinite
  `processing` state.
- Keep the renderer contract reusable by a later always-on Mac mini worker.

## Non-goals

- Automatically submitting the Wing product without the existing confirmation
  and execution controls.
- Supporting arbitrary web origins, storage endpoints, HTML, URLs, widths, or
  image formats supplied by a browser client.
- Replacing the detail-page editor or changing how saved HTML revisions are
  created.
- Replacing the editor's manual image-download feature in this change.
- Using `html2canvas`, canvas-based DOM cloning, visible-tab scroll capture,
  screenshot tiling, PDF conversion, or server-side Sharp stitching.
- Treating IndexedDB as durable cross-device storage or as the server's source
  of truth.
- Falling back to server Puppeteer when the extension is missing or outdated.
- Introducing the Mac mini worker in the first rollout.

## Considered Approaches

### Chrome extension CDP capture — selected

The Coupang extension opens a dedicated inactive KidItem render tab, attaches
to that exact tab through `chrome.debugger`, measures the complete document,
and calls `Page.captureScreenshot` once with JPEG output and
`captureBeyondViewport: true`. It uploads the returned JPEG directly to the
server-issued object-storage target and finalizes the artifact through an
authenticated API.

This is selected because Wing registration already depends on the extension,
the tested company Chrome can render the exact document, and the application
server performs no browser or image-encoding work.

### In-page `html2canvas`

The web app could clone the preview DOM into a canvas and upload `canvas.toBlob`
output. This uses no extension permission, but the current code explicitly
records that long detail pages frequently stall in this path. It also adds
cross-origin image and font constraints that native Chrome screenshots do not
have. It is rejected.

### Dedicated remote renderer now

A managed browser service or immediately provisioned Mac mini could claim jobs
and generate the image centrally. This is appropriate for later unattended or
batch rendering, but it adds infrastructure, lifecycle, observability, and cost
before the company needs them. It is deferred, while the selected renderer
contract remains compatible with it.

## Architecture

### Web registration coordinator

The collected-product Wing flow remains the user entrypoint. It first requests
the saved candidate detail-image state from NestJS.

- `ready`: continue with the existing stored `imageUrl`.
- `render_required`: require extension capability
  `detailPageClientRasterV1`, open the dedicated extension port, send the
  server-issued render intent ID, display phase progress, and wait for a
  terminal extension reply.
- `missing`: stop before opening Wing and explain that a saved detail page is
  required.
- terminal client-render failure: stop before opening Wing and expose a retry
  action.

The registration page and its extension message do not receive raw HTML,
storage credentials, or an object key they can choose. The isolated render
route fetches HTML through the normal authenticated web API client. The
registration flow does not invoke the old server raster worker as a fallback.

### Render-intent service

NestJS resolves the candidate's selected/current detail-page revision under the
current `organizationId`. It checks for a valid artifact keyed by:

```text
organizationId + revisionId + variant + outputWidth
```

The initial variant is `wing-client-jpeg-v1` and the only accepted width is
780. If no artifact exists, the server creates a short-lived render intent that
binds the organization, source candidate, detail-page artifact, exact revision,
variant, output width, deterministic object key, requesting user, and expiry.

The intent state machine is:

```text
issued -> claimed -> uploaded -> completed
   |         |          |
   +------> failed <-----+
   +------> expired
```

Only one extension claim may own an active attempt at a time. Reclaiming an
expired or explicitly failed attempt creates a new bounded attempt; it never
changes the bound revision or target key. Completed intents return their
artifact idempotently.

### Dedicated render route and document

The extension opens an inactive tab to the same-environment web route
`/detail-page-client-render?intentId=:intentId`. This route contains no normal
application shell or controls. It uses the existing authenticated `apiClient`
to fetch the protected render-document payload, so no bearer token or signed
document capability is placed in the tab URL.

The server document endpoint:

- scopes the intent by `organizationId`;
- rejects expired, terminal, or mismatched intents;
- reads the exact saved revision bound to the intent;
- wraps it with the existing server-render document and compiled template CSS;
- returns the wrapped HTML and immutable identity metadata with
  `Cache-Control: no-store`;
- never accepts HTML, CSS, asset URLs, or revision identity from the client.

The render route places the returned document in one borderless sandboxed
`srcDoc` iframe at 720 CSS pixels. Before insertion it strips every script from
the saved document and injects only KidItem's trusted metrics/readiness bridge.
It reuses the existing detail-preview metrics message to size the iframe to its
complete content height. When the iframe's fonts and all required images have
decoded, the top-level route exposes a small readiness marker containing only
the intent ID, revision ID, CSS content size, and asset-load result. The route
accepts metrics only from its owned iframe window and verifies them against the
server response. It emits no editor chrome, controls, or unrelated application
UI.

The document loads the revision's normal absolute image URLs. The server does
not inline image binaries. Any required image failure or bounded load timeout
is terminal for that attempt; the renderer must not capture a partially loaded
detail page.

### Chrome extension renderer

The Coupang extension adds the manifest `debugger` permission and advertises
`detailPageClientRasterV1: true` only when the complete implementation is
present. It also adds only the exact object-storage upload origins required by
the closed environment mapping.

For one render intent the service worker:

1. derives `environmentId` from the verified KidItem external-message sender;
2. claims the intent through the environment-aware authenticated API client;
3. creates one inactive tab for the server-provided same-environment render
   route URL;
4. verifies the final tab origin, path, intent marker, and revision marker;
5. attaches `chrome.debugger` to that exact `tabId`;
6. enables the Page and Runtime CDP domains;
7. applies a 720 CSS-pixel layout width and the fixed device scale needed for
   780 output pixels;
8. reads `Page.getLayoutMetrics().cssContentSize` and rejects non-finite,
   non-positive, or over-budget output dimensions;
9. invokes `Page.captureScreenshot` exactly once with JPEG quality 90,
   `fromSurface: true`, and `captureBeyondViewport: true`;
10. decodes the base64 result into a JPEG blob and validates its magic bytes,
    MIME type, pixel width, positive height, and configured byte budget;
11. writes the blob to the extension's IndexedDB retry cache;
12. uploads it directly to the server-issued presigned object URL;
13. finalizes the intent through NestJS and removes the cached blob;
14. detaches the debugger and closes only the renderer-owned tab in `finally`.

The extension never attaches to the user's Wing tab, current active tab, or an
arbitrary URL. Opening DevTools on the renderer tab can detach the debugger;
that event becomes an explicit retryable render failure.

### Direct object-storage upload

The extension requests a short-lived presigned PUT target only after claiming
the intent. The server derives the object key; no client-provided bucket, key,
content type, or public URL is trusted. The key is deterministic:

```text
detail-page-images/{organizationId}/{revisionId}/wing-client-jpeg-v1-780.jpg
```

The upload uses `Content-Type: image/jpeg`. Finalization supplies only observed
metadata: byte length, SHA-256, pixel width, and pixel height. NestJS performs an
object `HEAD`, verifies the intent-derived key, content type, positive bounded
size, and expected metadata, then upserts the durable artifact and marks the
intent completed. If upload succeeds but finalization is interrupted, a retry
can finalize the same object without recapturing.

Because the key is deterministic per revision and variant, interrupted uploads
cannot create an unbounded series of orphan keys. A later valid retry overwrites
the same target. Server cleanup may delete only an exact intent-derived key
that has no completed artifact; it never accepts a deletion key from the
client.

### Durable artifact

Add a `DetailPageImageArtifact` model rather than using `AiDirectJob.result` as
the long-term cache. The record contains:

- `id`, `organizationId`, `revisionId`;
- `variant`, `outputWidth`;
- `objectKey`, `imageUrl`, `contentType`;
- `byteLength`, `pixelWidth`, `pixelHeight`, `sha256`;
- `rendererKind` (`chrome_extension` initially);
- `createdByUserId`, `createdAt`, and `updatedAt`.

It has a unique constraint on
`[organizationId, revisionId, variant, outputWidth]`. Reads and upserts always
include `organizationId`. A new revision cannot reuse an older revision's image.

Add a `DetailPageImageRenderIntent` model for bounded ownership and audit. It
contains the bound candidate/artifact/revision identity, output variant,
server-derived object key, state, expiry, claimant/attempt timestamps,
requesting user, and bounded error code/message. Expired intent rows may be
retained for audit under the existing data-retention policy; they are never
treated as artifacts.

## IndexedDB Retry Cache

IndexedDB belongs to the extension origin and is only a local retry buffer. A
cache entry is keyed by intent ID and contains the JPEG blob, revision ID,
variant, output width, byte length, SHA-256, creation time, and expiry.

- Upload failure keeps the bounded entry and returns `upload_retryable`.
- A retry first attempts to upload/finalize a matching unexpired blob.
- Revision, variant, width, or intent mismatch discards the entry.
- Successful finalization removes the entry.
- Expired entries are removed on extension startup and before each render.
- The cache has a small total byte/count limit and evicts oldest expired or
  failed entries first.

No Wing registration reads an IndexedDB blob as the durable result. Only a
server-verified object-storage artifact unlocks Wing form fill.

## API and Extension Contract

The following route names and semantic contracts are fixed:

### Prepare

`POST /api/ai/detail-page-image/candidate/:candidateId/client-render`

Returns one of:

```text
ready
  artifactId, revisionId, imageUrl, outputWidth, contentType, byteLength

render_required
  intentId, revisionId, outputWidth, expiresAt

missing
  reason, message
```

### Claim and upload target

`POST /api/ai/detail-page-image/render-intents/:intentId/claim`

The extension calls this with its environment access token. It returns the
fixed render-document URL and short-lived presigned upload target. A claim from
another organization or an expired/terminal intent is rejected.

### Render document

`GET /api/ai/detail-page-image/render-intents/:intentId/document`

The isolated web render route calls this through the authenticated `apiClient`.
It returns the exact wrapped HTML, intent/revision identity, layout width, and
asset-readiness contract. It never accepts HTML in the request.

### Status

`GET /api/ai/detail-page-image/render-intents/:intentId`

Returns the organization-scoped intent state, bounded failure information, and
the completed artifact when present. The web uses it to recover after an
extension-port disconnect; it never returns a presigned upload target.

### Finalize

`POST /api/ai/detail-page-image/render-intents/:intentId/finalize`

Finalization is idempotent. It verifies object storage before creating or
returning the durable artifact.

### Fail

`POST /api/ai/detail-page-image/render-intents/:intentId/fail`

The extension sends a bounded error code and sanitized message. It cannot mark
another organization's intent or overwrite a completed artifact.

### External extension port

The web opens a long-lived external runtime port named
`kiditem-detail-page-raster-v1` and sends:

```text
action: renderDetailPageImage
intentId: UUID
```

The extension derives the environment from the sender and never accepts a
client-provided API base, render URL, upload URL, object key, HTML, or revision
ID. It emits progress messages for `loading`, `capturing`, `uploading`, and
`finalizing`, followed by exactly one terminal `rendered` or `failed` message.
The open port owns the interactive attempt and keeps the MV3 operation
observable. If it disconnects, the extension continues only a currently
running upload/finalization long enough to reach a durable state; the web reads
the server status endpoint before offering a retry.

## Wing Registration Integration

The existing one-image invariant remains unchanged:

```text
detailImageUrls = [verifiedArtifact.imageUrl]
```

The Wing flow checks the stored artifact first. For a cache miss it runs the
client renderer, then re-reads or consumes the finalized artifact before
building the Wing payload. It opens the Wing form only after the durable
artifact is verified. The extension's current upload-to-Coupang-CDN and HTML
`<img>` form-fill behavior remains unchanged.

An old extension that lacks `detailPageClientRasterV1` is blocked with explicit
reload/update guidance. It does not trigger the server renderer.

## Failure Semantics

| Condition | Required behavior |
|---|---|
| No saved/current revision | Return `missing`; do not open Wing. |
| Existing valid artifact | Return `ready` without opening a render tab. |
| Extension missing or outdated | Block with installation/reload guidance. |
| Intent expired or already claimed | Issue or request a fresh intent; never change its revision. |
| Render tab origin/path mismatch | Close the owned tab and fail closed. |
| Required image/font load failure | Fail before capture; do not upload a partial page. |
| Debugger attach/detach or DevTools conflict | Return a retryable capture error. |
| Invalid or over-budget document dimensions | Fail before capture with a bounded error. |
| Screenshot timeout or invalid JPEG | Keep Wing closed and return a retryable capture error. |
| Upload network failure | Retain the bounded IndexedDB blob and offer retry. |
| Upload succeeded, finalize failed | Retry `HEAD` and finalization without recapture. |
| Object metadata mismatch | Reject finalization and do not publish an artifact. |
| Revision changes during an intent | Complete only the bound old revision; a new registration request selects the new revision and requires its own artifact. |
| User closes Chrome or the renderer tab | Expire/fail the intent; no server worker fallback. |

No error path silently falls back to representative images, section images,
another revision, another organization, another environment, or server
Puppeteer.

## Security and Permission Boundary

- `chrome.debugger` is a powerful permission. The extension uses it only after
  a verified KidItem-origin command and only on a newly created, tracked render
  tab.
- The extension verifies the exact supported KidItem origin before attach and
  again before capture.
- The universal environment mapping remains the authority for API and web
  origins. External messages cannot inject either.
- All mutating server endpoints receive `organizationId` from
  `@CurrentOrganization()` or the extension access token; they never trust an
  organization ID in request data.
- Render-document and upload targets are short lived and `no-store`.
- Object keys and public URLs are server derived.
- Logs contain intent/revision IDs and phase timings, not HTML, image bytes,
  bearer tokens, presigned query strings, or storage credentials.
- The renderer always detaches in `finally`, including timeout and tab-close
  paths.

## Performance and Success Criteria

The staging acceptance fixture is the saved revision
`60620087-f5d8-4307-8591-221fd018eaa0` for candidate
`472ba5a7-0785-4931-a1e5-112ef1716a5a`.

The rollout is accepted only when:

- the extension produces one valid JPEG with width 780 and the complete detail
  page height in one `Page.captureScreenshot` call;
- the exact fixture reaches a finalized object-storage artifact within 30
  seconds on the designated company Mac under normal network conditions;
- an unchanged revision reuses its artifact and reaches Wing preparation within
  two seconds, excluding unrelated Wing page load time;
- the staging API and worker launch no Chromium process for this registration;
- the resulting bucket URL is fetchable and the Wing extension successfully
  uploads that single image to Coupang's CDN;
- server memory remains within its normal non-rendering envelope during the
  operation;
- capture, upload, and finalize timings are observable separately.

If the exact fixture cannot meet the client capture target, the change does not
fall back to server rasterization. The next renderer is the Mac mini worker
behind the same intent/artifact contract.

## Testing Strategy

### Server

- Unit tests for artifact cache hits, intent issuance, claim ownership,
  expiration, idempotent finalization, and revision isolation.
- Repository integration tests for organization-scoped unique artifact upsert
  and render-intent state transitions.
- Storage adapter tests for presigned target generation and `HEAD` validation.
- Controller tests proving that request bodies cannot select organization,
  revision, object key, storage origin, output format, or arbitrary width.
- Regression tests proving Wing preparation never schedules the old
  `detail_page_rasterize` worker after cutover.

### Web

- Tests for `ready`, `render_required`, `missing`, outdated-extension, progress,
  retryable upload, and terminal capture states.
- A contract test that Wing form fill receives exactly one finalized artifact
  URL and never receives a local blob/data URL.
- A regression test that Wing does not open before artifact finalization.

### Extension

- Mocked `chrome.debugger` tests for the exact tab target and command order.
- Tests asserting one and only one `Page.captureScreenshot` call.
- Dimension, JPEG signature, timeout, detach, tab-close, and DevTools-detach
  tests.
- Environment and origin rejection tests.
- IndexedDB retry, expiry, eviction, and finalize-without-recapture tests.
- Tests that presigned URLs and tokens are absent from persisted logs/status.

### Staging

- Load the updated unpacked extension and confirm the new capability.
- Use the exact saved failure fixture and record phase timings.
- Verify the stored object by MIME type, JPEG signature, byte length, width,
  complete height, and public fetch.
- Retry the same unchanged revision and prove cache reuse.
- Run Wing form fill without auto-submit and confirm the single detail image is
  present in the HTML editor.
- Confirm no Chromium process or detail-page raster job is started on the
  staging server.

## Rollout and Compatibility

1. Add the artifact/intent schema, focused shared contracts, server APIs, and
   storage presign/verification behind the new client-render path. Record the
   exact `db:push` and no-backfill decision in the implementation PR.
2. Add the Coupang extension renderer, exact storage host permissions, and
   `detailPageClientRasterV1`; increase its manifest version.
3. Add the web coordinator and progress UI, but keep Wing auto-submit disabled
   during staging acceptance.
4. Validate the exact staging fixture and the one-image Wing form-fill behavior.
5. Cut Wing preparation over to the durable artifact repository and stop
   scheduling server `detail_page_rasterize` work.
6. Keep the old worker implementation only until the new regression gate and
   staging acceptance pass, then remove its Wing entrypoint instead of leaving
   a fallback. The separate editor manual-download route remains out of scope.

Existing `wing-jpeg-v1` server artifacts may be read during rollout if their
revision, width, content type, and object are valid. New writes always use
`wing-client-jpeg-v1`. Failed or pending historical direct jobs do not block a
new client intent.

## Mac Mini Evolution

The server contract deliberately separates renderer assignment from artifact
identity. A later Mac mini worker can authenticate, claim the same kind of
render intent, open Chrome, capture one JPEG, upload to the same deterministic
key, and call the same finalization contract with
`rendererKind = mac_mini_chrome`.

At that cutover the web stops sending the extension render command and instead
polls the centrally claimed intent. The artifact schema, cache key, storage
path, Wing one-image contract, and validation rules remain unchanged.

## Documentation Impact

Implementation must update `docs/ARCHITECTURE.md` because ownership of Wing
detail-page rasterization moves from the backend AI worker to the browser
extension, while the backend retains orchestration and artifact authority. It
must also update the relevant environment/extension runbook with:

- the new `debugger` permission and operator warning;
- exact allowed storage upload origins;
- extension reload/version verification;
- staging acceptance procedure and failure evidence;
- the fact that no server-render fallback exists.

## Official References

- [Chrome `debugger` extension API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Chrome DevTools Protocol overview](https://chromedevtools.github.io/devtools-protocol/)
- [CDP Page domain: `getLayoutMetrics` and `captureScreenshot`](https://chromedevtools.github.io/devtools-protocol/tot/Page/)
