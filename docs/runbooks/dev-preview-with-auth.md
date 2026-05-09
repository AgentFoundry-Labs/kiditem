# Runbook — Dev Preview With Auth (AI agents + worktrees)

**Purpose**: An AI preview agent (Claude Preview MCP, Playwright globalSetup,
or any tool that launches its own Chromium) lands on `/login` because the
isolated browser has no Supabase session cookie. Typing the password into
the form every session is friction. This runbook eliminates it.

**Policy**: Stays inside the existing `apps/server/src/auth/AGENTS.md`
contract — Supabase JWT only, no header impersonation, no `DevAuthMiddleware`
revival. The preview session callback is minted by Supabase Auth via
`admin.generateLink`, but only after the dev user is confirmed to have a local
`User` mirror and active `OrganizationMembership`.

## When to use this

| Situation | Use this runbook? |
|---|---|
| AI agent driving a fresh Chromium in preview MCP | **Yes** |
| Playwright `globalSetup` for E2E tests | **Yes** |
| Sharing an already-logged-in human Chrome with AI (claude-in-chrome) | No — that workflow has no login step |
| Stripe-style separated dev / staging / prod Supabase projects | Yes, per-environment — see "Stripe model alignment" below |
| Production | **Never**. Service-role key is dev-only. |

## Human prerequisites

Done once per developer:

1. `.env` and `apps/web/.env.local` exist in the canonical checkout, populated
   per [auth-supabase.md](./auth-supabase.md). Required keys:
   - `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (root `.env`)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     (`apps/web/.env.local`)
2. The dev user is mirrored into the local Postgres `users` table. If not,
   run `npx tsx scripts/sync-supabase-user.ts --email kiditem@naver.com
   --organizationId <uuid> --role admin` once.
3. Docker Postgres is up: `docker compose up -d postgres`.

## Agent actions (per fresh worktree)

```bash
./bin/dev-bootstrap.sh
```

What this does, in order:

1. Detects whether we're inside a tool-created worktree and copies `.env`
   and `apps/web/.env.local` from a sibling checkout that already has them.
   This covers `.claude/worktrees/*` and `.codex/worktrees/*`.
2. Runs `npm install --legacy-peer-deps` if `node_modules/` is missing.
3. Verifies `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are present.
4. Calls `scripts/create-dev-preview-session.mjs <dev-user-email>`, verifies
   local user/org identity, and writes:
   - `.dev-auth/callback.url` — callback URL to navigate
   - `.dev-auth/session.env` — non-secret `PREVIEW_USER_*` / organization
     identity used as verification evidence
5. Prints the URL and verified user/org on stdout for the AI agent to consume.

### Custom dev user

```bash
./bin/dev-bootstrap.sh --email another-user@example.com
```

The user must already exist in the dev Supabase project's `auth.users`, local
`users`, and active `OrganizationMembership`. The script will not create users.

### Custom preview/web origin

Use the exact origin where the isolated browser opens the web app. The values
below are examples; replace them with the host and port shown in your preview
browser address bar:

```bash
./bin/dev-bootstrap.sh --web-origin <actual-preview-origin>
# or
DEV_WEB_ORIGIN=<actual-preview-origin> ./bin/dev-bootstrap.sh
```

The callback URL and Supabase `redirectTo` must match the browser origin.
For example, `localhost` and `127.0.0.1` are different cookie origins, and so
are two different ports on the same host. If they do not match exactly, the
cookie lands on the wrong origin and the app reports a missing login session.

### Fresh clone (no canonical checkout to copy from)

```bash
./bin/dev-bootstrap.sh --canonical /path/to/another/checkout
# or copy .env / apps/web/.env.local manually first, then:
./bin/dev-bootstrap.sh
```

## AI preview agent flow

After `bin/dev-bootstrap.sh` succeeds:

```text
1. preview_start name=server
2. preview_start name=web
3. CALLBACK_URL = $(cat .dev-auth/callback.url)   # via Bash tool
4. preview_eval (web): window.location.href = '<CALLBACK_URL>'
5. (wait ~3s for /auth/callback → / redirect)
6. preview_eval (web): window.location.pathname     # should be '/' now
7. preview_eval (web): fetch('/api/auth/me', { credentials: 'include' })
   # must return 200 with email + organizationId
8. proceed with whatever the task is
```

The Supabase auth cookie (`sb-<project-ref>-auth-token`) is set by the
`/auth/callback` page during step 4. Subsequent `apiClient` calls from the
web app and `fetch` calls in `preview_eval` automatically attach it.

## Verification

```bash
./bin/dev-bootstrap.sh
test -s .dev-auth/callback.url && echo "callback url written"
test -s .dev-auth/session.env && cat .dev-auth/session.env

# After preview starts:
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:4000/api/agent-os/definitions
# 401 expected without auth.

# After AI navigates the preview to the callback URL and the cookie lands,
# preview-Chromium fetch('/api/auth/me', { credentials: 'include' }) returns
# 200 and includes email + organizationId.
```

## Success criteria

- `.dev-auth/callback.url` contains a single URL on the form
  `<DEV_WEB_ORIGIN>/auth/callback?token_hash=…&type=magiclink&next=/`.
- `.dev-auth/session.env` contains `PREVIEW_USER_ID`,
  `PREVIEW_USER_EMAIL`, `PREVIEW_ORGANIZATION_ID`, and
  `PREVIEW_MEMBERSHIP_ID`.
- Navigating the preview to that URL leaves you on `/` (or the configured
  `next`) without any login form interaction.
- `GET /api/auth/me` from the preview browser returns the same dev user and
  non-null organization id.

## Blocker criteria

| Symptom | Likely cause | Fix |
|---|---|---|
| `SUPABASE_URL or SUPABASE_SECRET_KEY missing` | `.env` empty or pointing at a different file | Re-run with `--canonical /path/to/canonical` |
| `create-dev-preview-session.mjs` says Supabase user is missing | Dev user not in Supabase | Add via Supabase Dashboard → Authentication → Users |
| `create-dev-preview-session.mjs` says local mirror or active membership is missing | Local `users` row or `OrganizationMembership` is not ready | Run `scripts/sync-supabase-user.ts` with the intended organization |
| Cookie set but `/api/auth/me` still 401 | Callback origin mismatch or expired callback | Re-run with exact `--web-origin` and navigate the fresh URL |
| Browser reports missing session after callback | Callback URL host/port does not match preview origin | Re-run with `--web-origin <actual preview origin>` |
| Cookie expires mid-session | Supabase access token TTL ~1h | Re-run `bin/dev-bootstrap.sh` to mint a fresh callback URL |

## Stripe model alignment

The current setup treats one cloud Supabase project as the dev environment
because that is where the team is today. The Stripe-style hard separation
(`sk_test_*` / `sk_live_*` analogue) means a real adoption path is:

1. Create three Supabase projects: `kiditem-dev`, `kiditem-staging`,
   `kiditem-prod`.
2. Each environment's `.env` points at its own project. Service-role keys
   never cross environments.
3. `bin/dev-bootstrap.sh` always points at the dev project. AI/preview cannot
   reach prod even if the script runs in the wrong directory.
4. Seed users (`kiditem@naver.com`, `qa@example.com`, …) live only in the
   dev project's `auth.users`.

Until that split lands, treat the existing project as the dev environment
only and never expose its service-role key in front-end code, browser
extensions, or shared infra.

## Final report format (for AI agents)

When the agent reports completion of this runbook:

```text
- env files: copied / already present / [list of created paths]
- npm install: skipped / installed
- callback url: written to .dev-auth/callback.url
- preview identity: user=<email> organization=<uuid>
- preview navigated: yes / no
- /api/auth/me: <status code>, organizationId=<uuid or null>
```
