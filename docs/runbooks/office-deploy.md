# Office Deployment Runbook

## Preconditions

- Run on the Windows Office host from a clean KidItem checkout.
- Docker Desktop uses the `desktop-linux` context.
- Current-profile Node is major 22. A .NET 8 SDK is available whenever the
  Gateway payload inputs changed or archived-payload reuse falls back to an
  exact-SHA full build.
- `C:\workspace\kiditem` is clean on `release/office`, tracking
  `origin/release/office`. Before a final release deployment it is fetched and
  fast-forwarded to the authoritative remote release SHA. A provisional
  incident hotfix may temporarily differ only under the emergency lane below.
- `C:\ProgramData\Kiditem\.env.office`,
  `C:\workspace\kiditem\apps\server\.env`, and the three external volumes
  already exist. Never print their values.

## Release lanes

Normal Office work lands in `develop`, is promoted by a reviewed
`develop -> release/office` PR using a merge commit, and is deployed from the
resulting remote release SHA. GitHub supplies review and branch history; it does
not build an Office bundle or release image.

An incident hotfix starts from the exact SHA recorded in the current runtime
manifest, not from accumulated unpublished `develop` work. After focused tests,
push the hotfix branch. When service restoration cannot wait for review, an
explicitly authorized deployment from `origin/<hotfix-branch>` is provisional.
Immediately follow it with a hotfix PR to `release/office`, deploy the resulting
release merge SHA, and forward-merge or equivalently apply the same fix to
`develop`. Do not leave a provisional runtime as the final Office identity.

If the fix already reached `develop`, reconcile with a reviewed
`develop -> release/office` PR rather than reconstructing history.

## Deploy

For a final application-only Office release:

```powershell
git -C C:\workspace\kiditem fetch origin release/office
git -C C:\workspace\kiditem merge --ff-only origin/release/office
npm run deploy:office:local -- --ref origin/release/office
```

The command refuses a dirty invoking checkout and refuses a final release when
the live checkout is not already at the same authoritative remote release SHA.
It fetches the named ref, resolves its full SHA, creates a clean detached temporary
worktree, builds API/web from it, resolves the Gateway payload, verifies VERSION
and SHA identities, records the prior runtime, and performs a controlled
recreate. It never pulls an Office image and never modifies the live checkout.
The live fast-forward is therefore a distinct reviewed operator step.

Gateway payload reuse is automatic; there is no operator skip flag or general
`node_modules` cache. The deployer diffs the current manifest SHA against the
target SHA only for root package/lock/npm/TypeScript configuration, Prisma,
`packages/shared`, `apps/agent-gateway`, and
`deploy/office/gateway-build.ps1`. A match forces the exact-SHA build, including
`npm ci`. With no match, the deployer hash-verifies the current manifest's ZIP
under `deployments/bundles/<sha>`, extracts only the package, native executable,
and runtime contract, writes a new target VERSION/SHA identity, and creates a
new ZIP/hash. Missing, corrupt, or runtime-incompatible archives fall back to
the full build before any live runtime change.

If the deployed-to-target diff includes Prisma or data-migration surfaces, the
normal command stops before build. After explicit cutover review, run:

```powershell
npm run deploy:office:local -- --ref origin/release/office --cutover --confirm APPLY_SCHEMA_DATA
```

That operation stops writers for pre-schema migration, Prisma push, and
post-schema migration. A failure after database work begins leaves API, worker,
web, nginx, and Gateway stopped. Runtime-only rollback is intentionally blocked
for an immediate schema/data cutover.

Schema/data cutovers are never performed from a provisional hotfix ref. Promote
and review them through `release/office` first.

The deployer never runs `docker system prune`. If disk capacity is the only
blocker, the operator may opt into bounded BuildKit cleanup with
`--prune-build-cache`; persistent volumes are never pruned.

## Status

```powershell
npm run deploy:office:status
```

Status verifies container health plus the runtime manifest, local API/web image
IDs and VERSION/SHA labels, rendered Compose identity, Gateway release identity,
scheduled-task contract, selected Windows profile, and disk usage. It also reads
the authoritative remote `release/office` SHA and warns when either the live
checkout or runtime manifest is not aligned. A non-release runtime is reported
as provisional rather than silently appearing final.

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

Record the release PR, named remote ref, full SHA, live/remote/runtime alignment,
VERSION, API/web image IDs, Gateway ZIP SHA-256, container/HTTP status, Gateway
task/profile, bundled CLI versions, and whether a provisional hotfix or
schema/data cutover was used. Do not include env values, bearer tokens, or
provider output.
