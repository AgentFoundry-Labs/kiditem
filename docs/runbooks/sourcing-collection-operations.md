# Sourcing Collection Operations

## Purpose

Use this runbook to start, watch, and recover one explicit sourcing collection:
a browser source attempt the KidItem OS extension collects, or the 1688 keyword
search the API drives over the Office Chrome CDP endpoint. It is not a procedure
for direct provider calls, direct database edits, or reviving a terminal
attempt.

The ownership flow is exact:

```text
sourcing screen CTA -> source owner attempt (SourcingEvidenceIngestionRun)
browser source -> KidItem OS collector -> token-fenced owner terminal
server source  -> Office Chrome CDP    -> token-fenced owner terminal
owner COMPLETE snapshot -> sourcing screen
```

The source owner is the only writer of its attempts, canonical facts, and
terminal status. A screen reads the owner's latest COMPLETE snapshot; a running
attempt is never a substitute payload, and completing a collection publishes no
downstream calculation.

## Human Prerequisites

- Sign in to the intended KidItem organization and use its normal web session.
- For a browser source, load the KidItem OS extension in the same Chrome profile
  as the authenticated provider tab. Login, OTP, CAPTCHA, and account selection
  remain human work in that profile.
- For 1688 keyword search, confirm the Office Chrome CDP endpoint is reachable
  from the API container and its persistent profile is still signed in. Chrome is
  a host process; the API connects to it and never launches, closes, or restarts
  it.
- Do not record credentials, cookies, tokens, raw provider rows, or extension
  payloads in tickets, logs, screenshots, or this runbook.

If the provider session or the authenticated stack is unavailable, run the
deterministic checks in Verification and report the missing prerequisite instead
of fabricating a browser action or a provider outcome.

## Environment

| Setting | Check |
| --- | --- |
| `SOURCING_PLAYWRIGHT_CDP_ENDPOINT` | Required for 1688 keyword search. Accepts an `http`, `https`, `ws`, or `wss` URL carrying no credentials; the Office value is `http://kiditem-office:9444`. A missing or malformed value fails the attempt with `cdp_configuration_invalid`. |

Read the value from the protected API environment; do not print the whole file
or copy it into an Agent/MCP child. The remaining sourcing runtime variables are
inventoried in [environment-variables.md](environment-variables.md).

## Start And Inspect A Collection

Every collection starts from an explicit screen control. Page mount, reload,
route navigation, and filter changes must start zero external collection.

| Source | Start | Status or snapshot |
| --- | --- | --- |
| Naver and Shorts trends | `POST /api/sourcing/trend/collect` | `GET /api/sourcing/trend/status` |
| 1688 hot products | `POST /api/sourcing/1688-trends/attempts` | `GET /api/sourcing/1688-trends/current` |
| TikTok creative trends | `POST /api/sourcing/tiktok-creative/attempts` | `GET /api/sourcing/tiktok-creative/current` |
| Live commerce | `POST /api/sourcing/live-commerce/browser/attempts` | `GET /api/sourcing/live-commerce/browser/current` |
| Wing catalog | `POST /api/sourcing/workspace/wing-catalog/attempts` | `GET /api/sourcing/workspace/wing-catalog/current` |
| Keyword suggestions | `POST /api/sourcing/workspace/keyword-suggestions/attempts` | `GET /api/sourcing/workspace/keyword-suggestions/current` |
| Product page extraction | `POST /api/sourcing/extension/product-data/attempts` | `GET /api/sourcing/extension/product-data/status?sourceUrl=` |
| 1688 keyword search (Office CDP) | `POST /api/sourcing/wholesale/1688/keyword-search` | `GET /api/sourcing/wholesale/1688/keyword-search/:attemptId` |
| 1688 image match (tabless HTTP) | `POST /api/sourcing/wholesale/1688/image-matches` | `GET /api/sourcing/wholesale/1688/image-matches/:attemptId` |
| Market shadow signal | `POST /api/sourcing/trend/shadow/collect` | `GET /api/sourcing/trend/shadow/status` |
| Naver keyword analysis | `POST /api/sourcing/keyword-analysis/collect` | `GET /api/sourcing/keyword-analysis/status?input=<json>` |

Both `?sourceUrl=` and `?input=` are required and fail closed when absent: a
status read is always scoped to the exact target that was collected.

A start carries an `idempotency-key` header; replaying the same key returns the
first attempt instead of opening a second one. The response omits the attempt
token on every read: only the collector that received it at start may send the
chunk, terminal, or failure write, and it sends that token as
`x-source-attempt-token`.

Three reads do not return the plain source status below.
`GET /api/sourcing/trend/status` returns one status per source as
`{ naver, shorts }`, and the two `wholesale/1688/.../:attemptId` reads return
`{ attempt, unit }` for that one attempt, where `unit` is `null` while it runs.

Inspect these attempt fields:

| Field | Meaning | Operator response |
| --- | --- | --- |
| `state` | `RUNNING`, `COMPLETE`, or `FAILED` | Follow the table below; never edit the row by hand. |
| `expiresAt` | The attempt lease: fifteen minutes for every source except product page extraction, which holds a two-minute extension lease | A passed lease is a fence concern, not a reason to revive the attempt. |
| `plan` and `planChecksum` | The targets frozen at start | A terminal payload that does not match the frozen plan is rejected, not stored. |
| `acceptedCount` and `warnings` | Canonical rows published by this attempt | Treat an absent count as unknown, never as an accepted zero. |
| `errorCode` and `errorMessage` | Bounded failure code and operator text | Use for diagnosis; raw provider text never belongs here. A 1688 search keeps them null even after a provider failure and reports the code in its unit result instead. |

And these source-status fields:

| Field | Meaning |
| --- | --- |
| `ready` | The latest COMPLETE attempt still matches the current frozen plan. |
| `latestAttempt` | The newest attempt in any state, including a running one. |
| `latestComplete` | The snapshot every reader uses. A failed attempt keeps the previous one. |
| `actualCutoffAt` | The moment that snapshot actually covers, which may be older than the request. |

## Office 1688 Keyword Search Runtime

The 1688 keyword search connects to the configured CDP endpoint, takes the host
browser's first context, and creates one page it owns. It closes only that page
and detaches the client; host Chrome, its login state, and unrelated tabs
survive every run. There is no extension, anonymous-browser, or fresh-profile
fallback, and image matching stays tabless HTTP.

### Diagnose a keyword search by its unit result

A keyword search opens one attempt per keyword, and every outcome, including a
provider failure, terminalizes that attempt as COMPLETE with `errorCode` null
and its failure Alert resolved. So a CDP outage leaves no FAILED attempt and no
Alert to find: the bounded code lives in the unit result, in `result.units[]` of
the start response and as `unit` in
`GET /api/sourcing/wholesale/1688/keyword-search/:attemptId`. Image matching
uses the same shape.

```ts
{
  outcome: "complete" | "partial" | "no_change",
  summary: { discovered, accepted, duplicate, unchanged, failed },
  sources: [{ source, outcome, accepted, failed }],
  units: [{ keyword, targetId, outcome, discovered, accepted, duplicate, failed, errorCode? }],
  snapshotGeneratedAt?: string
}
```

The codes are bounded on purpose; raw provider text never reaches this result.

| `unit.errorCode` | Meaning | Operator response |
| --- | --- | --- |
| `cdp_configuration_invalid` | The endpoint is missing or malformed | Fix the protected API environment value, then retry from the screen. |
| `cdp_unavailable` | Chrome is not reachable or did not accept the connection | Confirm host Chrome is running with remote debugging on the expected endpoint. |
| `browser_context_unavailable` | The connected browser exposed no context | Open a normal window in the Office profile, then retry. |
| `marketplace_login_required` | The profile is signed out, or a CAPTCHA or verification page was served | Sign in or clear the challenge inside the Office profile; it is human work, never an automatic retry. |
| `search_extraction_failed` | Navigation left the allowed 1688 hosts, or the result page never became readable in its bounded window | Preserve the previous snapshot and retry once the provider page loads normally for a human. |
| `all_results_rejected` | The page was read, but no result carried an offer identity | Check the keyword on the provider page before retrying; nothing was published. |
| `provider_failed` | An unexpected runtime error, which also fails the request | Read the API log for that attempt and report it; the attempt itself stays intact. |

The first four codes stop the rest of the batch, because the remaining keywords
would fail the same way. The batch outcome is then `partial`: the keywords
already collected keep their published facts.

## Failure, Retry, And Attention

A source that reports its own failure, which is every source except the two 1688
searches, commits a bounded code and a durable Alert in the owner's terminal
transaction. The Alert is a human notification, not execution state.

| Situation | Safe action | Never do |
| --- | --- | --- |
| A running collection is no longer wanted | Let the lease expire, or complete the human step the collector is waiting on. | Delete or edit the attempt row, or start a second collection for the same source. |
| The browser needs login, OTP, CAPTCHA, or account selection | Keep the provider tab, finish the human action, then use the screen CTA again. | Treat authentication as a transient error, or bypass it with a copied session. |
| Provider outage or timeout | Keep the previous COMPLETE snapshot, record the bounded code from the attempt or the unit result, restore provider readiness, then start a new collection. | Replace the snapshot with empty data, or read a COMPLETE 1688 attempt as a successful collection without checking its unit. |
| The frozen plan no longer matches the targets | Start a new collection so the owner freezes the current plan. | Edit the stored plan or its checksum. |
| Fence or token lost | Stop the collector, close the tabs it owns, and read the source status. | Send a late terminal report, or reuse a token from an earlier attempt. |

A terminal attempt is immutable audit history. A retry is always a new attempt
with a new identity; nothing reactivates, requeues, or rewrites the old row.

## Route Check

When a real stack is available, walk the `/sourcing-ai` routes
(`category-sourcing`, `competitor-analysis`, `decision-center`,
`final-selection`, `keywords`, `market`, `product-tracking`, `recommendations`,
`rising-products`, `settings`, `validation`, `wholesale-search`,
`wing-catalog`) and the dashboard itself. For each one record that mount,
reload, and navigation start no collection, that the explicit CTA opens exactly
one attempt, and that a provider failure surfaces as a bounded code with the
previous snapshot intact rather than a false success count. Without that stack,
the substitute evidence is the focused tests below plus an exact list of the
missing API session, extension, or provider-session prerequisites.

## Verification

Run from the repository root:

```bash
rtk npm run check:conventions
rtk npm exec --workspace=apps/server vitest -- run src/sourcing
rtk npm run build --workspace=apps/web
```

`check:conventions` includes the sourcing collection guard, which fails on a
retired direct-extension collector, a collection started from a `useEffect`, and
a non-persisted read. For a schema or boot check use a fresh disposable
PostgreSQL database, never the default local or Office database; see
[deployment-architecture.md](deployment-architecture.md).

## Blockers

Stop and report rather than working around any of these:

- a missing authenticated KidItem session, extension capability, or provider
  login for a live collection;
- an unreachable or unvalidated Office Chrome CDP endpoint for 1688 keyword
  search;
- a mount, reload, or navigation that starts an external collection;
- a terminal result that claims success without a persisted owner snapshot;
- raw provider data, credentials, tokens, cookies, or arbitrary provider error
  text appearing in an attempt result, an Alert, or log evidence.
