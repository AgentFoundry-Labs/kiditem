# Deployment Architecture

## Office release path

Office has one final release path:

```text
reviewed develop or hotfix change
  -> merge commit in origin/release/office
  -> clean fast-forwarded live release/office checkout
  -> fetch and resolve one full remote SHA
  -> clean detached temporary worktree at that SHA
  -> local API image + local web image
  -> exact-SHA Gateway payload build or hash-verified archived-payload reuse
  -> target-identity Windows Gateway archive
  -> VERSION/Git SHA/image ID/archive hash verification
  -> controlled recreation with the existing env and external volumes
```

Run it from a clean KidItem checkout on the Windows Office host:

```powershell
npm run deploy:office:local -- --ref origin/release/office
npm run deploy:office:status
npm run deploy:office:rollback
```

GitHub does not publish an Office deployment bundle, API/web release images,
or a develop Gateway package. GHCR digests are not Office inputs. A reviewed
`release/office` PR supplies branch admission and audit history, while all
deployable artifacts are still built locally from its exact merge SHA. The API
runtime-base workflow remains only to maintain the Chromium-equipped Docker
base used by the checked-in API Dockerfile.

For an urgent incident, a remote hotfix ref created from the current runtime
SHA may be deployed provisionally with explicit authorization. That does not
replace branch admission: the fix is merged into `release/office`, deployed
again from the release merge SHA, and then forward-merged to `develop`.

## Source and build admission

The invoking checkout must have no tracked or untracked changes. The deployer
accepts only a named `origin/<branch>`, fetches that branch, compares the
remote-tracking commit with `ls-remote`, and creates a detached worktree at the
full SHA. Product Dockerfiles, Compose, nginx, Gateway launcher, API, web, and
Gateway all come from that worktree. Local checkout edits and arbitrary
Dockerfile copies therefore cannot enter the release.

For `origin/release/office`, deployment additionally requires the permanent
live checkout HEAD to equal that authoritative remote SHA before any build.
Other named refs are provisional incident sources and status reports their
runtime/release mismatch until reconciliation is complete.

API and web images use unique `office-<full-sha>` tags and record both
`org.opencontainers.image.revision` and
`org.opencontainers.image.version`. The runtime manifest also stores their
local image IDs. The Gateway archive contains its runtime contract plus
`release-identity.json` with the same VERSION and Git SHA.

## Runtime transaction

The permanent checkout at `C:\workspace\kiditem` remains a clean protected
`release/office` checkout and the final runtime audit anchor. Never delete or
prune that branch. Before a final deployment, an operator fetches and
fast-forwards it to the remote release SHA. The deployer verifies this identity
but does not pull, merge, reset, or build from the live checkout.

The protected `C:\ProgramData\Kiditem\.env.office`, server env file, and the
external PostgreSQL, MinIO, and CopilotKit volumes remain in place. Before
application recreation, the deployer records the active container image IDs,
copies the current runtime manifest to transaction storage, and retains the old
local images. API, worker, web, and nginx are then recreated with `--no-build`
and `--force-recreate`; data services and volumes are preserved.

An application-only failure automatically restores the previous Compose,
deploy env, image references, Gateway pointer, and runtime manifest. A
schema/data cutover failure stops all application surfaces because image-only
rollback cannot reverse a database change.

## Schema and data boundary

The deployed SHA-to-target SHA diff is scanned for `prisma/`,
`prisma.config.ts`, `scripts/data-migrations/`, and the migration runner. A
normal deploy refuses any match. An approved cutover is explicit:

```powershell
npm run deploy:office:local -- --ref origin/release/office --cutover --confirm APPLY_SCHEMA_DATA
```

The deployer stops writers, runs exact-SHA pre-schema migrations, applies
Prisma with `--accept-data-loss`, runs exact-SHA post-schema migrations, and
then starts the candidate. The runtime manifest records the changed paths and
approval. `deploy:office:rollback` refuses an immediate runtime-only rollback
from that cutover.

## Gateway and CLI profile

`deploy/office/gateway-build.ps1` is the explicit heavy-build boundary for the
Windows Gateway, including its self-contained native Job Runner and pinned
Codex/Claude packages. Gateway build inputs are the root package/lock/npm and
TypeScript configuration, Prisma, `packages/shared`, `apps/agent-gateway`, and
that build script. General admission, status, and rollback edits in
`apply-deployment.ps1` do not invalidate the payload.

When those inputs are unchanged, reuse starts only from the current manifest's
SHA-256-verified archived ZIP in `deployments/bundles/<sha>`; an expanded live
release is never a source. Only `agent-gateway.tgz`,
`KidItem.AgentGateway.exe`, and `gateway-runtime-contract.json` cross the reuse
boundary. A new `release-identity.json` and ZIP hash bind the target VERSION and
Git SHA. Archive absence, corruption, or runtime mismatch falls back to a full
exact-SHA build before live mutation.

The Gateway runs as a limited scheduled task under the invoking Windows user's
interactive profile and uses that profile's existing Node 22 and approved
provider login stores. No separate Windows account or second Node installation
is required.

## Regression boundary

`scripts/__tests__/office-deployment-contract.test.mjs` enforces the three
commands, final release/live-checkout alignment, provisional hotfix reporting,
safe remote-ref/worktree contract, local identity labels, schema/data gate,
runtime snapshot/restore, current-profile Gateway, archived-payload reuse and
fallback, target identity rebinding, status/rollback, and absence of the retired
GitHub Office workflows.
