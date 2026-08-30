# Office Deployment Runbook

## Preconditions

- Run on the Windows Office host from a clean KidItem checkout.
- Docker Desktop uses the `desktop-linux` context.
- Current-profile Node is major 22; .NET 8 SDK is available for the native
  Gateway build.
- `C:\workspace\kiditem` is clean on `release/office`, tracking
  `origin/release/office`. It remains protected against deletion but does not
  need to match the deploy target.
- `C:\ProgramData\Kiditem\.env.office`,
  `C:\workspace\kiditem\apps\server\.env`, and the three external volumes
  already exist. Never print their values.

## Deploy

For an application-only remote SHA:

```powershell
npm run deploy:office:local -- --ref origin/develop
```

The command refuses a dirty invoking checkout. It fetches `origin/develop`,
resolves its authoritative full SHA, creates a clean detached temporary
worktree, builds API/web/Gateway from it, verifies VERSION and SHA identities,
records the prior runtime, and performs a controlled recreate. It never pulls
an Office image and never modifies the live checkout.

If the deployed-to-target diff includes Prisma or data-migration surfaces, the
normal command stops before build. After explicit cutover review, run:

```powershell
npm run deploy:office:local -- --ref origin/develop --cutover --confirm APPLY_SCHEMA_DATA
```

That operation stops writers for pre-schema migration, Prisma push, and
post-schema migration. A failure after database work begins leaves API, worker,
web, nginx, and Gateway stopped. Runtime-only rollback is intentionally blocked
for an immediate schema/data cutover.

The deployer never runs `docker system prune`. If disk capacity is the only
blocker, the operator may opt into bounded BuildKit cleanup with
`--prune-build-cache`; persistent volumes are never pruned.

## Status

```powershell
npm run deploy:office:status
```

Status verifies container health plus the runtime manifest, local API/web image
IDs and VERSION/SHA labels, rendered Compose identity, Gateway release identity,
scheduled-task contract, selected Windows profile, and disk usage.

Expected HTTP checks after deployment:

- `http://127.0.0.1/login` -> 200
- `http://127.0.0.1/api/auth/me` -> 401

Verify provider/Gateway readiness through the API status surface, then send one
CLI-backed message. Provider login, if absent, is completed interactively in
the same Windows profile; credentials are never passed to the deploy command.

## Rollback

```powershell
npm run deploy:office:rollback
```

Rollback uses `C:\ProgramData\Kiditem\deployments\previous.json`, the retained
unique local image tags/IDs, archived Gateway ZIP, and archived runtime files.
It performs a controlled runtime-only recreate and re-verifies health. It does
not undo Prisma schema or data changes and therefore refuses immediately after
an approved schema/data cutover.

## Final report

Record the named remote ref, full SHA, VERSION, API/web image IDs, Gateway ZIP
SHA-256, container/HTTP status, Gateway task/profile, bundled CLI versions, and
whether a schema/data cutover was used. Do not include env values, bearer
tokens, or provider output.
