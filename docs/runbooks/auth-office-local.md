# KidItem Local Authentication

KidItem owns email/password authentication for local development and the Office
runtime. Supabase Auth/JWT/JWKS is not part of browser, API, proxy, or extension
authentication.

## Runtime Contract

- `User.passwordHash` maps to `users.password`. Values use
  `scrypt$16384$<salt-base64url>$<digest-base64url>` with a random 16-byte salt
  and 64-byte derived key. Plaintext is never stored or logged.
- Login creates a random 32-byte base64url token with a 30-day absolute expiry.
  PostgreSQL stores only its SHA-256 hash in `auth_sessions`.
- The HttpOnly `kiditem_session` cookie is the browser's single credential.
  `POST /api/auth/login` returns only the public user projection; it does not
  return a browser bearer token.
- GET `/api/auth/me` is the UI authentication-state check.
- POST `/api/auth/extension-handoff` is the only authenticated browser boundary
  that reveals the current opaque token for an installed KidItem extension.
  Ordinary browser code does not persist or attach it.
- Each login creates an independent session. Logout revokes the current session.
  Password changes and administrative revocation revoke all sessions for the
  user.
- Session middleware selects one active `OrganizationMembership`, ordered by
  `lastSelectedAt desc, joinedAt asc`. Browser input never supplies an
  organization ID.

## Fresh Local Development Database

A fresh schema contains no user or membership. Follow
[Local Development](local-development.md) and run the guarded local bootstrap:

```bash
npm run dev:bootstrap-user -- --email you@example.com
```

It is an explicit data/bootstrap operation, not an auth side effect. It:

- accepts only a loopback, non-production/staging database;
- upserts the requested local Organization, User, and active admin membership;
- reads and confirms the password interactively, sending it to the TypeScript
  entrypoint through stdin only;
- stores only the scrypt hash;
- revokes existing sessions for that user; and
- never creates a session or bypasses normal login.

Do not use this command for Office or a remote database.

## Existing User Password And Revocation

For an existing local user, use the interactive wrapper:

```bash
npm run auth:password
npm run auth:password -- --email you@example.com
```

The target `User` and active `OrganizationMembership` must already exist. The
wrapper prompts twice without echo and never places the password in argv,
shell history, chat, logs, or an env file.

Office uses the secure-stdin PowerShell procedure in
[Initialize Office Login](office-deploy.md#initialize-office-login). The
low-level CLI entrypoints are:

```text
node dist/auth/adapter/in/cli/auth-admin.js set-password --email EMAIL --password-stdin
node dist/auth/adapter/in/cli/auth-admin.js revoke-sessions --email EMAIL
```

The auth administration CLI deliberately does not create users. Office account
creation/restoration remains an explicit owning data operation.

## Browser And Extension Flow

```text
POST /api/auth/login
  -> verify normalized email + scrypt hash
  -> create hashed AuthSession row
  -> set HttpOnly kiditem_session
  -> return public user only

GET /api/auth/me
  -> cookie middleware
  -> current user + organization projection

POST /api/auth/extension-handoff
  -> authenticated cookie + exact current session verification
  -> no-store opaque token response for the installed extension only
```

The Web API client always uses `credentials: include`. It never reads a bearer
from localStorage or attaches one. Extensions keep their delivered credential
inside the extension boundary and send it as `Authorization: Bearer` to the
same KidItem API.

## Verification

1. Unauthenticated `GET /api/auth/me` returns 401 `auth_required`.
2. Invalid email, inactive user, missing hash, and wrong password all return the
   same `invalid_credentials` response.
3. Valid login sets the HttpOnly cookie and returns a public user without a raw
   token field.
4. Refresh and a second tab resolve authentication through `/api/auth/me`.
5. Two browser profiles can remain logged in through independent sessions.
6. Authenticated extension handoff returns a token only for the exact current
   session and sets `Cache-Control: no-store`.
7. Logout invalidates the current session. Password change/revoke invalidates
   all of that user's browser/extension sessions on their next API request.
8. No Web/API auth path reads `kiditem.auth.session.v1`,
   `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_URL`, Supabase cookies, or JWKS.

## Security Boundary And Blockers

Office currently uses `http://kiditem-office`; the cookie is therefore not
`Secure`, and LAN traffic is not encrypted. Keep Office on the trusted LAN with
no public port forwarding. Stop rollout if remote/untrusted access is required
before HTTPS is installed.

Stop and report instead of bypassing authentication when:

- the schema was not applied or `auth_sessions` is absent;
- the target Office user/membership is missing or inactive;
- the local bootstrap rejects a non-loopback database;
- a password would have to be exposed in argv, env, chat, or logs;
- browser and extension credentials diverge or cross environment boundaries;
- ordinary Web code can read the session token; or
- revoke/logout behavior cannot be verified.

## Final Report

Report the release SHA, schema-apply result, user email only, password command
success, browser/me result, extension handoff result, logout/revoke result, and
HTTP-vs-HTTPS network boundary. Never report passwords, hashes, raw tokens,
cookies, database URLs, or session IDs.
