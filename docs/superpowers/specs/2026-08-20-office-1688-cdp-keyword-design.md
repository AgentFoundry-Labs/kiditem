# Office 1688 CDP Keyword Collection Design

- Date: 2026-08-20
- Status: Concept approved; written design awaiting user review
- Tracking issue: KID-24
- Source baseline: `d817db4eb878`
- Classification: bounded Sourcing runtime migration across Operations, the
  Sourcing server runtime, Office deployment configuration, and the exact
  KidItem OS handler being retired
- Scope: `sourcing.search_1688_keyword_batch` only
- Data decision: reuse the existing typed 1688 observation and snapshot models;
  no schema change and no backfill
- Release decision: one-way cutover with no automatic extension or anonymous
  browser fallback

## 0. Executive decision

The Office deployment will execute `sourcing.search_1688_keyword_batch` as a
server-owned `domain` operation that attaches through Chrome DevTools Protocol
(CDP) to a dedicated, already logged-in Chrome profile on the same Office PC.
The API remains in Docker; Chrome remains a host process. The initial endpoint
is configured as:

```text
SOURCING_PLAYWRIGHT_CDP_ENDPOINT=http://kiditem-office:9444
```

The operation key, UI start flow, `OperationRun` identity, resource class,
progress panel, cancellation, deadline, retry, and persisted snapshot read
contract remain unchanged. Only the executor owning the browser interaction
changes from KidItem OS to the API server's operation worker.

This is not a return to a synchronous HTTP scraper. The UI still creates or
adopts one durable `OperationRun` and immediately returns. The operation worker
claims the run, performs provider I/O outside a database transaction, and
publishes each keyword result only inside the existing active-attempt fence.

## 1. Evidence and corrected assumption

The earlier CDP attempt did not prove that a correctly cloned logged-in Chrome
profile failed. It proved only that the launched CDP Chrome was not using the
operator's authenticated profile.

The corrected verification used this sequence:

1. identify the real profile in `chrome://version`;
2. quit Chrome completely;
3. copy the complete parent `User Data`, not only one profile directory;
4. launch the copy with both the copied `--user-data-dir` and the exact
   `--profile-directory`;
5. confirm the copied profile path in the clone's `chrome://version`;
6. verify an authentication-required 1688 page and keyword search;
7. restart the copied Chrome and verify that authentication persisted.

Under those conditions, the historical server extractor returned real results
for the tested keywords. The same page also exposed two current-site parsing
facts that must be retained in the new adapter:

- offer links can use
  `http://detail.m.1688.com/page/index.html?offerId=...`, not only `/offer/`;
- sales text such as `近30天成交 88 笔` means 88 sales, not 30.

Repeated automation can still trigger 1688 login or security verification.
That condition is an operator-attention state, not evidence that CDP cannot use
the authenticated profile and not permission to bypass the challenge.

## 2. Scope and non-goals

### 2.1 In scope

- migrate `sourcing.search_1688_keyword_batch` from `engineType: browser` to
  `engineType: domain`;
- increment the operation definition version because executor ownership changes;
- retain `resourceClass: playwright_1688` with capacity one;
- attach to a dedicated Office Chrome through a configurable CDP endpoint;
- search one to six canonical keywords serially in one operation-owned page;
- extract and validate current 1688 search data;
- persist through the existing source-control and active-attempt transaction
  boundaries;
- remove only the exact KidItem OS keyword-search operation handler and its
  now-unused content hook;
- update Office environment documentation, the Sourcing runbook, and scoped
  `AGENTS.md` guidance to reflect the new ownership.

### 2.2 Out of scope

- `sourcing.collect_1688_trends`, which remains an extension-owned browser
  operation;
- `sourcing.match_wholesale_images`, which remains a server-owned direct
  AlphaShop/provider operation and opens no Chrome tab;
- arbitrary URL scraping or exposing raw CDP through an API, Agent OS, or MCP;
- using a personal daily-driver Chrome profile as the automation runtime;
- CAPTCHA, slider, login, or security-challenge bypass;
- a second queue, a second run ledger, or resurrection of runs after API restart;
- automatic fallback to KidItem OS, an anonymous Playwright browser, or a fresh
  temporary profile.

## 3. Office topology

```text
Sourcing UI
    |
    | POST/start existing OperationRun
    v
Office API container ---- PostgreSQL
    |
    | Playwright connectOverCDP
    | SOURCING_PLAYWRIGHT_CDP_ENDPOINT
    v
kiditem-office host alias / internal CDP hostname
    |
    v
Dedicated host Chrome + persistent 1688 automation profile
```

The Office Compose topology already maps `${OFFICE_HOST}` to the Docker host
gateway. With `OFFICE_HOST=kiditem-office`, the API container can connect to the
host Chrome without embedding a machine IP in application code.

Chrome is an independently managed host process. API startup does not launch,
kill, or clone it. API readiness also does not depend on Chrome being available;
an unavailable CDP runtime fails the requested operation with a bounded error
while unrelated API features remain available.

## 4. Operation ownership and lifecycle

### 4.1 Definition

The operation retains its exact key and user-facing behavior:

```text
key:                sourcing.search_1688_keyword_batch
version:            2
ownerDomain:        sourcing
engineType:         domain
resourceClass:      playwright_1688
maxAttempts:        3
executionTimeoutMs: 15 minutes
scheduleSupported:  false
input:               1..6 normalized unique keywords
```

Existing version-1 active or waiting runs are not converted. Normal API
lifecycle cleanup terminally cancels them during deployment. A later process
does not claim, resume, requeue, or reinterpret them under version 2.

### 4.2 Execution sequence

1. The UI explicitly starts or reconnects to the durable operation; route mount
   performs no collection.
2. The operation worker claims the run through the existing domain runner and
   obtains its `AbortSignal`, checkpoint function, deadline, and attempt identity.
3. The handler validates the persisted input with the shared strict schema.
4. The provider adapter connects to the configured CDP endpoint and opens one
   new operation-owned page in the dedicated profile's default context.
5. Keywords execute serially because the logged-in profile is the scarce
   resource. The same owned page is reused within the batch.
6. Before and after each provider boundary, the handler checks the operation
   signal/checkpoint and updates bounded stage/count progress.
7. Provider results are held as typed values outside a database transaction.
8. Each keyword's canonical claim/commit occurs inside the active domain
   attempt fence and the existing opaque transaction. The Operation row is
   locked and its organization, key, status, token, lease, deadline, and API
   lifecycle are verified before the Sourcing write.
9. The handler closes only the page it created and detaches its Playwright
   client. It never closes operator tabs or terminates the host Chrome process.
10. The run returns the existing bounded, row-free Sourcing operation result.

Results committed before a later cancellation remain valid observations.
Results fetched before cancellation but not yet committed cannot become
canonical after the fence is lost.

### 4.3 Shutdown and no resurrection

API shutdown first stops intake, aborts active handlers, and completes the
bounded terminal sweep. The CDP adapter stops new navigation, closes only its
owned page, and releases the connection within the handler cleanup budget.
Runs from the stopped API lifecycle are terminal and never revive on the next
boot. Chrome and its authenticated profile remain running independently.

## 5. CDP endpoint and future HTTPS/WSS contract

`SOURCING_PLAYWRIGHT_CDP_ENDPOINT` is runtime configuration, not persisted run
input. No hostname or scheme is hardcoded in application code.

An optional `SOURCING_PLAYWRIGHT_CDP_HEADERS_JSON` secret-backed value contains
a strict JSON object of string header names and values for an authenticated
reverse proxy. It is empty for the initial host-gateway deployment. A malformed
object or non-string value fails configuration validation; the value is never
logged. This uses Playwright's supported `connectOverCDP` connection headers and
avoids placing credentials in a URL.

The strict configuration parser supports these schemes:

- `http://` and `https://` for a CDP discovery endpoint;
- `ws://` and `wss://` for a direct browser WebSocket endpoint.

It rejects unsupported schemes, embedded username/password credentials, and
malformed URLs. The resolved endpoint and any authorization data are never
written to an `OperationRun` result or application log.

The initial Office value may be `http://kiditem-office:9444` because it crosses
only the Docker host gateway on the same physical PC and is restricted by the
host firewall. Later it can be changed to an internal real hostname such as an
HTTPS or WSS endpoint without changing the operation or UI contracts.

That later transition is valid only when all of these conditions hold:

1. the name is a dedicated internal CDP hostname, not the public KidItem app
   domain;
2. the API container trusts the TLS certificate and complete certificate chain;
3. an HTTP reverse proxy preserves the CDP discovery response and WebSocket
   `Upgrade` traffic, or a stable direct WSS endpoint is supplied;
4. network policy restricts access to the Office API host/container;
5. strong authentication is added if network isolation alone is insufficient;
6. a smoke test is run from inside the `kiditem-api` container before cutover.

Playwright's installed `connectOverCDP` contract accepts an HTTP URL or CDP
WebSocket URL and supports additional connection headers. Credentials must not
be embedded in the endpoint URL or printed. A private certificate is installed
in the container trust store or supplied through the standard Node CA mechanism;
TLS verification is never disabled. Changing from the local HTTP alias to
HTTPS/WSS is therefore configuration and deployment work, not another Sourcing
architecture migration.

## 6. Browser profile and tab ownership

The supported runtime is a dedicated permanent Chrome automation profile:

- seed it once from a verified authenticated profile only while all source
  Chrome processes are stopped, copying the complete `User Data` parent;
- confirm the exact copied profile path in `chrome://version`;
- keep it separate from the operator's personal default profile;
- allow an operator to complete 1688 login/security prompts manually;
- persist cookies and storage in that dedicated profile directory;
- start Chrome through an Office startup task with a fixed remote-debugging
  port and the dedicated user-data/profile arguments;
- never recopy the source profile as part of an operation.

Closing an operation-owned page does not delete the profile or log the account
out. Live acceptance must prove that after a run the Chrome process and CDP port
remain alive, an unrelated pre-existing tab remains untouched, and a later run
still sees the authenticated session.

Only one `playwright_1688` run executes at a time. This avoids concurrent
navigation and login-state races in the shared profile. A future increase in
capacity requires separate managed profiles and an explicit account policy.

## 7. Extraction and normalization

The adapter uses a layered, bounded extractor:

1. register response observation before navigation and prefer the current 1688
   search API payload when it is available;
2. validate redirects and final navigation against the existing 1688/Alibaba
   source URL policy;
3. fall back to the rendered DOM, including open shadow roots, only when the API
   payload is unavailable;
4. recognize offer identity from both `/offer/` URLs and an `offerId` query
   parameter on current mobile-detail URLs;
5. normalize an extracted offer URL to an approved HTTPS 1688/Alibaba source
   URL before it can be persisted;
6. parse the sales count from the transaction portion of localized sales text,
   not from the time-window number;
7. normalize and deduplicate by offer identity;
8. validate every item with `Sourcing1688SearchItemSchema` and cap one keyword at
   the existing maximum of 40 items;
9. preserve the exact canonical keyword and persisted capture time.

The adapter never evaluates arbitrary client-provided JavaScript and accepts no
client-provided provider URL, page count, result limit, or CDP endpoint.

## 8. Result and error semantics

Expected outcomes remain truthful and bounded:

| Condition | Operation behavior | Canonical write |
| --- | --- | --- |
| authenticated results | `complete` or `partial` summary | fenced typed observations |
| valid search with zero offers | `no_change` for that unit/batch | durable empty observation marker |
| some keywords fail, others commit | succeeded run with `partial` result | successful fenced units only |
| all keywords fail for provider/data reasons | failed run with bounded code | none after failed fences |
| login expired or security challenge | `attention_required` with marketplace-login copy | none for challenged unit |
| CDP missing/unreachable | bounded configuration/transport failure | none |
| malformed/unknown provider shape | bounded extraction failure, never raw HTML/error | none for that unit |
| cancel/deadline/shutdown | existing terminal lifecycle code | no post-fence write |

Login and security challenges are not automatically retried as ordinary network
errors. The UI directs the operator to the dedicated Chrome profile, and an
explicit new/retry operation is required after the operator resolves the issue.
Raw cookies, HTML, provider responses, exception messages, CDP URLs, and result
rows never appear in the safe `OperationRun.result`.

## 9. Security boundary

Raw CDP access is equivalent to broad control of the logged-in browser and its
cookies. It must not be exposed to the public internet or an unrestricted Office
LAN.

The initial host setup must:

- bind remote debugging only as broadly as Docker host access requires;
- restrict port 9444 with the Windows/host firewall to the Docker host-gateway
  path and approved local administration;
- use a dedicated least-privilege 1688 account/profile where practical;
- keep CDP endpoint/auth values in runtime environment or secrets, not source;
- avoid logging `/json/version` payloads because they include a browser
  WebSocket URL;
- verify from a non-approved host that the port is unreachable.

A future TLS proxy must preserve the same authorization boundary. TLS alone is
not access control.

## 10. Migration and cleanup

The cutover is performed in one cohesive implementation:

1. add RED tests for the version-2 domain definition, CDP configuration,
   extraction fixtures, cancellation races, and tab/process ownership;
2. implement the server port, CDP adapter, domain handler, and fenced commits;
3. prove server behavior before removing the current extension handler;
4. remove only `sourcing.search_1688_keyword_batch` from the KidItem OS browser
   operation registry and delete its now-unused search hook/extractor glue;
5. preserve extension-owned trend/live operations and all non-1688 handlers;
6. update static architecture gates so the keyword operation cannot silently
   return to an extension bridge or synchronous controller;
7. update Office env examples, environment runbook, Sourcing operation runbook,
   architecture documentation, and scoped `AGENTS.md` rules;
8. deploy only after the dedicated Chrome/CDP smoke check passes from the API
   container.

There is no runtime dual path. Rollback means deploying the previous known-good
application/extension pair, not falling back inside a failed run.

## 11. Verification strategy

### 11.1 Contract and unit tests

- operation key stays stable, version becomes 2, engine becomes `domain`, and
  resource class remains `playwright_1688`;
- input remains strict, normalized, unique, and bounded to six keywords;
- endpoint parser accepts HTTP/HTTPS/WS/WSS and rejects unsafe/malformed forms;
- strict optional connection headers reach the CDP handshake without appearing
  in logs or results, and invalid header JSON fails configuration validation;
- absent or unreachable CDP fails closed without canonical writes;
- current API and DOM fixtures parse mobile `offerId`, open shadow roots, price,
  image, and localized sales count correctly;
- valid zero results and provider failure produce different outcomes;
- login/security fixtures produce `attention_required`;
- keywords execute serially and progress/checkpoints occur at unit boundaries;
- the adapter closes only its owned page and preserves unrelated pages.

### 11.2 Transaction and lifecycle tests

- real PostgreSQL test: cancellation after provider return but before the active
  attempt callback produces zero writes for that unit;
- wrong organization, operation key, status, token, expired lease, expired
  deadline, and non-accepting API lifecycle invoke the owner callback zero times;
- a successful active attempt commits the typed observation atomically;
- shutdown aborts the handler within budget and a second API context does not
  reclaim or resume the old run;
- a blocked `playwright_1688` slot does not block other resource classes.

### 11.3 Build and runtime gates

- focused shared/server/extension/web suites;
- full affected Operations and Sourcing lifecycle suites;
- shared, server, and web builds in serial order;
- IDOR, tenant-scope, raw-snapshot, sourcing long-running-action, and
  architecture scanners;
- disposable PostgreSQL schema setup plus an explicit-DATABASE_URL Nest boot;
- standalone operation worker registration showing the domain handler and no
  extension keyword handler dependency.

### 11.4 Live Office QA

With the dedicated Chrome profile logged in:

1. run the container-side CDP smoke check;
2. keep one unrelated tab open;
3. start a one-keyword operation and verify persisted results plus a completed
   `OperationRun`;
4. start a six-keyword operation and verify serial progress and bounded output;
5. confirm the unrelated tab, Chrome process, CDP port, and login session survive;
6. force or observe a login/security page and verify `attention_required` with
   zero challenged-unit writes;
7. cancel while provider work is in flight and verify no late canonical write;
8. restart the API and verify the old run does not resurrect;
9. repeat the smoke test after any change to an HTTPS/WSS hostname, proxy,
   certificate, or authorization policy.

No CAPTCHA or security challenge is bypassed to complete QA.

## 12. Acceptance criteria

This migration is complete only when:

- `sourcing.search_1688_keyword_batch` runs solely as a version-2 domain
  operation through the configured Office CDP runtime;
- the UI and persisted read contracts require no caller change beyond normal
  operation adoption;
- provider work never runs in the user HTTP request and no automatic collection
  starts on mount;
- every canonical keyword write is protected by the active domain attempt fence;
- cancel, deadline, shutdown, wrong token, and lifecycle loss cannot publish a
  late result;
- the dedicated host Chrome, login profile, and unrelated tabs survive each run;
- login/security challenges become truthful operator attention states;
- HTTP, HTTPS, WS, and WSS endpoint forms are configuration-compatible, with
  the TLS/network/auth requirements in this document enforced operationally;
- the exact extension keyword handler and its obsolete hook are removed while
  all other extension collection operations remain registered;
- there is no anonymous browser, direct controller, extension bridge, or
  server-restart fallback;
- deterministic tests, disposable-DB boot, builds, scanners, and live Office QA
  all pass with their evidence recorded.
