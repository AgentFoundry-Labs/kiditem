# Deployment Architecture

## Office release path

Office has one supported release path:

```text
named origin/<branch>
  -> fetch and resolve one full remote SHA
  -> clean detached temporary worktree at that SHA
  -> local API image + local web image + Windows Gateway archive
  -> VERSION/Git SHA/image ID/archive hash verification
  -> controlled recreation with the existing env and external volumes
```

Run it from a clean KidItem checkout on the Windows Office host:

```powershell
npm run deploy:office:local -- --ref origin/develop
npm run deploy:office:status
npm run deploy:office:rollback
```

GitHub does not publish an Office deployment bundle, API/web release images,
or a develop Gateway package. GHCR digests and a `release/office` promotion PR
are not Office admission inputs. The API runtime-base workflow remains only to
maintain the Chromium-equipped Docker base used by the checked-in API
Dockerfile.

## Source and build admission

The invoking checkout must have no tracked or untracked changes. The deployer
accepts only a named `origin/<branch>`, fetches that branch, compares the
remote-tracking commit with `ls-remote`, and creates a detached worktree at the
full SHA. Product Dockerfiles, Compose, nginx, Gateway launcher, API, web, and
Gateway all come from that worktree. Local checkout edits and arbitrary
Dockerfile copies therefore cannot enter the release.

API and web images use unique `office-<full-sha>` tags and record both
`org.opencontainers.image.revision` and
`org.opencontainers.image.version`. The runtime manifest also stores their
local image IDs. The Gateway archive contains its runtime contract plus
`release-identity.json` with the same VERSION and Git SHA.

## Runtime transaction

The permanent checkout at `C:\workspace\kiditem` remains a clean protected
`release/office` checkout, but it is an operational anchor rather than the
deployment source. Never delete or prune that branch. Deployment does not pull,
merge, reset, or build from the live checkout.

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
npm run deploy:office:local -- --ref origin/develop --cutover --confirm APPLY_SCHEMA_DATA
```

The deployer stops writers, runs exact-SHA pre-schema migrations, applies
Prisma with `--accept-data-loss`, runs exact-SHA post-schema migrations, and
then starts the candidate. The runtime manifest records the changed paths and
approval. `deploy:office:rollback` refuses an immediate runtime-only rollback
from that cutover.

## Gateway and CLI profile

The Windows Gateway is built locally, including its self-contained native Job
Runner and pinned Codex/Claude packages. It runs as a limited scheduled task
under the invoking Windows user's interactive profile and uses that profile's
existing Node 22 and approved provider login stores. No separate Windows
account or second Node installation is required.

## Regression boundary

`scripts/__tests__/office-deployment-contract.test.mjs` enforces the three
commands, safe remote-ref/worktree contract, local identity labels, schema/data
gate, runtime snapshot/restore, current-profile Gateway, and absence of the
retired GitHub Office workflows.
