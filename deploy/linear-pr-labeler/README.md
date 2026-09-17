# Linear PR Labeler

A Cloudflare Worker that puts the `PR` label (`#<number> <short title>`) on the
Linear issues a kiditem pull request completes. Linear calls it through an
"Issue attachments" webhook whenever the GitHub integration links a PR to an
issue. Tracked in KID-260.

**Owner:** deployed by hand to a team member's personal Cloudflare account
(currently yhc125). It is not part of the Office release, and nothing in the
product depends on it. While it is down, sessions apply the label by hand as
[the tracker conventions](../../docs/agents/issue-tracker.md) describe.

## Behavior

1. **Checks the delivery.**
   - Verifies `Linear-Signature` (HMAC-SHA256 of the raw body) and rejects
     bodies over 1 MB.
   - Reads the signed `webhookTimestamp`:
     - within one minute: on time;
     - up to 8 hours old: still processed and logged as `late_delivery`, which
       covers Linear's retries after 1 minute, 1 hour and 6 hours;
     - older than 8 hours, or more than one minute ahead of the Worker's
       clock: answered with 200 and dropped.
   - Late, retried or replayed deliveries are safe: a run reads the current
     state and does not depend on which delivery started it.
   - Answers 200 at once, then works in the background.
2. **Filters.** Ignores everything except Attachment `create`/`update` events
   whose URL is a pull request in `AgentFoundry-Labs/kiditem`.
3. **Reconciles the PR.**
   - Each PR has its own Durable Object. It queues deliveries and runs them one
     at a time; a failed run never drops the runs queued behind it.
   - An `update` that arrives within 60 seconds of a clean run is skipped,
     because checks and reviews arrive in bursts. A `create` always runs, and
     so does the first `update` after a failed or partial run.
   - Each run does the following:
     - Reads every Kiditem issue attached to the PR. It stops without calling
       GitHub when no attached issue needs a change.
     - Reads the PR from GitHub and skips PRs closed without merging.
     - Decides which issues the PR completes. Magic words count in the title
       as well as the body, and a closing word wins over the others:
       - issues named after a closing word (`close`, `fix`, `resolve`,
         `complete` and `implement` in all their forms, plus
         `linear issue`);
       - issues named in the branch or title, unless a contributing word
         (`ref`, `refs`, `references`, `part of`, `contributes to`,
         `toward`, `towards`) or a relation word (`relates to`,
         `related to`) names them.
     - Leaves out issues that were completed or canceled before the PR
       opened. The PR only mentions them.
     - Finds the label:
       - it reuses the oldest active `#<number> ` label in the `PR` group,
         including one a session made by hand;
       - otherwise it creates `#<number> <short title>`. The short title comes
         from the description in a `kid-<n>-<desc>` branch, or from the PR
         title otherwise. The label description reads
         `<PR URL> — <PR title> · <author>`.
     - Applies the label, so that each issue carries the label of the PR
       linked to it last:
       - an issue with no PR label gets this one;
       - an issue that carries another PR's label is switched only when this
         PR was attached to it after that PR. On a tie, or when that PR was
         attached later, the issue keeps its label. A PR-group label without a
         number, or one whose PR is no longer attached, counts as older.
     - Keeps going when one issue fails, and reports it as
       `reconcile_partial`.

The object logs every run as `reconciled`, `reconcile_partial`,
`reconcile_failed` or `reconcile_skipped`.
- **Repair:** the next attachment update for the same PR repairs a missing
  label or an unfinished switch.
- **Repeat failures:** a failure that comes back every time, such as an expired
  token, keeps showing up in the logs until someone fixes it.
- **Orphaned label:** when a session made its own `#<number> ` label while the
  Worker was creating one, the older label wins. The Worker's copy stays
  unused, and the run is logged as a warning with `orphanedLabel`. Delete the
  copy by hand.

**Known gap:** when a PR closes without merging, its label stays on the issues
it already labelled. Remove the label by hand if the work moved to another PR.

## Setup

Use your own accounts for every value below. Keep the values out of chat,
issues and git.

1. Install dependencies: `cd deploy/linear-pr-labeler && npm ci`.
2. Log in to your personal Cloudflare account with `npx wrangler login`, and
   turn on two-factor authentication for that account: it will hold a Linear
   write key.
3. Deploy with `npx wrangler deploy` and note the URL
   (`https://linear-pr-labeler.<subdomain>.workers.dev`). Until the three
   secrets exist, the Worker answers 503.
4. Create a GitHub fine-grained token under your personal settings
   (Settings → Developer settings → Personal access tokens → Fine-grained
   tokens → Generate new token):
   - resource owner: **AgentFoundry-Labs**. The default is your own account,
     which cannot read kiditem;
   - repository access: only `kiditem`;
   - permission: Pull requests, read-only.

   Store it with `npx wrangler secret put GITHUB_TOKEN`.
5. Create a Linear personal API key (Settings → Account → Security & access)
   with the Read and Write permissions. The workspace has one team, so no team
   restriction is needed. Store it with `npx wrangler secret put LINEAR_API_KEY`.
6. Ask a workspace admin to create a Linear webhook (Settings → Administration
   → API):
   - URL: `<worker URL>/linear`;
   - team: Kiditem;
   - data change event: Issue attachments.

   Store its signing secret with `npx wrangler secret put LINEAR_WEBHOOK_SECRET`.
7. Verify: run `npx wrangler tail` while a PR opens. Expect a
   `"event":"reconciled"` line with `"outcome":"labelled"`.

Linear shows the labels and label changes as made by the API key's owner.

## Development

- `npm test`: unit tests, a check that every Linear query stays under Linear's
  complexity limit, and runs in the local Workers runtime (wrangler's test
  harness with a local HTTP fake for Linear and GitHub).
- `npm run typecheck`: generates `worker-configuration.d.ts`, then
  type-checks `src/` with the Workers types and the tests with the Node types.
- The Worker entry module (`src/index.ts`) may export only handlers and the
  Durable Object class. The runtime refuses to start on any other export.
- `npm run build`: bundles to `dist/` without deploying.
- Configuration lives in `wrangler.jsonc` `vars`. Secrets live only in
  Cloudflare, and locally in `.dev.vars` (see `.dev.vars.example`).

## Operations

- **Logs:** `npx wrangler tail`, or the Worker's Observability tab in the
  Cloudflare dashboard.
- **Expired or revoked token:** runs fail with `reconcile_failed` and
  `HTTP 401`. Create a new token, store it with `wrangler secret put`, then
  revoke the old one.
- **Budgets:** Linear allows 2,500 requests an hour per API key, and the
  Worker warns (`linear_requests_low`, `linear_complexity_high`) as the budget
  runs low. The URL is public, so unsigned requests still count against the
  Workers free plan's 100,000 requests a day, even though they are rejected.
- **Disabled webhook:** Linear disables a webhook that keeps failing. Fix the
  Worker first, then re-enable the webhook in Linear.
- **Stopping:** disable the Linear webhook, or run `npx wrangler delete`.
