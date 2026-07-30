# KidItem Local Authentication

KidItem owns email/password authentication for the Office runtime. Supabase
Auth is not part of browser, API, proxy, or extension authentication.

## Runtime Contract

- `User.passwordHash` maps to the existing `users.password` column. Values use
  `scrypt$16384$<salt-base64url>$<digest-base64url>` with a random 16-byte salt
  and 64-byte derived key. Plaintext is never stored or logged.
- Login issues a random 32-byte base64url token with a 30-day absolute expiry.
  PostgreSQL stores only its SHA-256 hash in `auth_sessions`.
- The browser stores the raw token at `kiditem.auth.session.v1` so the same
  token can be sent to the Chrome extensions. The API also sets
  `kiditem_session` as HttpOnly, SameSite=Lax, path `/`.
- Each login creates an independent session. Logout revokes only the current
  session. Password changes and the administrator revoke command revoke all
  sessions for the user.
- The session middleware selects one active `OrganizationMembership`, ordered
  by `lastSelectedAt desc, joinedAt asc`. Browser input never supplies an
  organization id.

## Prerequisites

- The target `User` and active `OrganizationMembership` already exist.
- The Office release containing `auth_sessions` was deployed with the explicit
  `-ApplySchema` switch from [Office Deploy](office-deploy.md).
- Commands run inside the live API image and receive passwords only through
  stdin. Never put a password in argv, shell history, chat, logs, or an env
  file.

## Password And Revocation Operations

For local development, use the interactive wrapper. It prompts for the email
and asks for the password twice without echoing or placing it in argv, shell
history, chat, or an environment file:

```bash
npm run auth:password
```

To prefill only the non-secret email:

```bash
npm run auth:password -- --email EMAIL
```

Use the secure-stdin PowerShell procedure in
[Initialize Office Login](office-deploy.md#initialize-office-login). The CLI
entrypoint is:

```text
node dist/auth/adapter/in/cli/auth-admin.js set-password --email EMAIL --password-stdin
node dist/auth/adapter/in/cli/auth-admin.js revoke-sessions --email EMAIL
```

The CLI deliberately does not create users. `user_not_found` is a blocker;
create or restore the local user and membership through the owning data
procedure before setting a password.

## Verification

1. Unauthenticated `GET /api/auth/me` returns 401 `auth_required`.
2. Invalid email, inactive user, missing hash, and wrong password all return the
   same `invalid_credentials` response.
3. A valid login returns an opaque 43-character token, sets the cookie, and
   returns the selected membership context.
4. Two PCs/browser profiles can remain logged in simultaneously.
5. The Coupang and sourcing extensions receive the current web token and use it
   as `Authorization: Bearer`; tokens stay isolated by verified KidItem origin.
6. Logout invalidates only the current session. `revoke-sessions` invalidates
   every current browser/extension session on its next API request.
7. No application web/API auth path reads `NEXT_PUBLIC_SUPABASE_*`,
   `SUPABASE_URL`, a Supabase auth cookie, or JWKS.

## Security Boundary And Blockers

The raw browser token is intentionally JavaScript-readable because extensions
need the same credential. XSS prevention and strict extension sender-origin
validation are therefore critical. The database must never store raw tokens.

Office currently uses `http://kiditem-office`; consequently the cookie is not
`Secure`, and LAN traffic is not encrypted. Keep Office on the trusted LAN with
no public port forwarding. Stop rollout if remote/untrusted access is required
before HTTPS is installed.

Stop and report instead of bypassing authentication when:

- the schema was not applied or `auth_sessions` is absent;
- the target user/membership is missing or inactive;
- the password would have to be exposed in argv or logs;
- browser and extension tokens diverge or cross environment boundaries;
- revoke/logout behavior cannot be verified.

## Final Report

Report the release SHA, schema-apply result, user email only, password command
success, multi-PC result, extension result, logout/revoke result, and HTTP-vs-
HTTPS network boundary. Never report passwords, hashes, raw tokens, cookies, or
database URLs.
