# Channel Recipe Transfer

Use this runbook to carry explicitly reviewed channel-to-Sellpia recipes from a
local completed catalog into an already deployed staging environment. The
transfer artifact is reviewed operator data, not a matching rule or a release
data migration. Raw exports stay outside Git. An explicitly approved shared
mapping may be committed under `scripts/channel-recipe-mappings/` when it
contains only channel external IDs, Sellpia SKU codes, and quantities.

The tool resolves stable channel listing/option external IDs and Sellpia SKU
codes in the target environment. It never assumes local UUIDs are reusable.
Writes go through authenticated Products plan/create-if-empty batch APIs, use
the current organization from the session, and only fill empty recipes. Each
request carries at most 100 recipes so a full transfer stays below the global
API request limit and the default request-body limit. An identical existing
recipe is an idempotent skip; a different existing recipe blocks the run
instead of being overwritten.

## Prerequisites

- Local Wing collection and Sellpia inventory collection are complete, and the
  reviewed local recipes have been saved.
- Staging is deployed through `staging-deploy.yml`; this procedure is not a
  deployment path. Confirm the deploy, public smoke, migration status, deploy
  tag, and final EC2 status using `docs/runbooks/staging-deploy.md`.
- The same Wing catalog and Sellpia inventory have been collected in staging
  before planning a transfer.
- The operator has the exact separately approved Organization UUID and the
  exact target channel-account UUID for each environment.
- For plan/apply, an authenticated operator cookie jar or short-lived bearer
  token file exists outside the repository. Supply exactly one. Do not print,
  commit, or paste its contents into a report.
- Use either a reviewed shared mapping under `scripts/channel-recipe-mappings/`
  or a private transfer JSON outside the repository or below ignored
  `.secrets/`. Never commit organization/account UUIDs, authentication data,
  customer/supplier names, prices, stock values, or raw collection payloads.

## Environment

Local export reads `DATABASE_URL` through `dotenv/config`. Point dotenv at the
local server environment without sourcing or printing the file:

```bash
export DOTENV_CONFIG_PATH='apps/server/.env'
```

Plan/apply require only explicit CLI arguments. Use:

```bash
export KIDITEM_BASE_URL='https://<approved-staging-origin>'
export KIDITEM_COOKIE_FILE='<private-cookie-jar-path>'
export KIDITEM_APPROVED_ORGANIZATION_ID='<approved-organization-uuid>'
export KIDITEM_CHANNEL_ACCOUNT_ID='<target-channel-account-uuid>'
export KIDITEM_RECIPE_ARTIFACT='scripts/channel-recipe-mappings/rocket-sellpia-reviewed-2026-07-24.json'
```

Never put operator URLs, cookie/token paths, organization UUIDs, or account
UUIDs in Git, command examples committed with real values, or screenshots.

The examples use `--cookie-file`. An approved non-browser operator may replace
that one argument with `--bearer-token-file <private-token-path>`; never pass a
token directly on the command line.

## Export The Reviewed Local Recipes

Export all non-empty recipes reachable from the selected active local channel
account. The JSON contains no database UUIDs or names; it uses listing external
ID, option external ID, Sellpia SKU code, and positive component quantity.

```bash
rtk npm run recipes:transfer -- export \
  --target local \
  --organization-id "$KIDITEM_APPROVED_ORGANIZATION_ID" \
  --channel-account-id "$KIDITEM_CHANNEL_ACCOUNT_ID" \
  --output "$KIDITEM_RECIPE_ARTIFACT"
```

Retain the printed counts. Do not print the raw JSON. Raw exports remain private
until every mapping and quantity is reviewed. If the mappings must be shared,
copy only the schema-approved stable identity fields into a dated file under
`scripts/channel-recipe-mappings/`, review its Git diff, and add a schema-valid
artifact test. The approved Rocket mapping from this review is:

```text
scripts/channel-recipe-mappings/rocket-sellpia-reviewed-2026-07-24.json
```

## Plan Against Staging

Use the staging account UUID, which may differ from local. The tool first calls
`GET /api/auth/me` and requires the observed organization to equal the separate
approval value. It then resolves every stable channel identity, fetches current
product recipes and active Sellpia SKUs, and reports counts only.

```bash
rtk npm run recipes:transfer -- plan \
  --target staging \
  --base-url "$KIDITEM_BASE_URL" \
  --cookie-file "$KIDITEM_COOKIE_FILE" \
  --approved-organization-id "$KIDITEM_APPROVED_ORGANIZATION_ID" \
  --channel-account-id "$KIDITEM_CHANNEL_ACCOUNT_ID" \
  --input "$KIDITEM_RECIPE_ARTIFACT"
```

Require all artifact identities to resolve. Stop if an option is missing or
unlinked, a Sellpia code is missing/duplicated/inactive, or any target variant
already has a different recipe. Do not weaken the artifact or substitute a
nearby name merely to make the plan pass.

## Apply To Staging

Apply only the exact artifact that passed the current plan:

```bash
rtk npm run recipes:transfer -- apply \
  --target staging \
  --base-url "$KIDITEM_BASE_URL" \
  --cookie-file "$KIDITEM_COOKIE_FILE" \
  --approved-organization-id "$KIDITEM_APPROVED_ORGANIZATION_ID" \
  --channel-account-id "$KIDITEM_CHANNEL_ACCOUNT_ID" \
  --input "$KIDITEM_RECIPE_ARTIFACT" \
  --confirm APPLY_CHANNEL_RECIPE_TRANSFER
```

The tool first preflights every batch through the read-only create-if-empty
plan endpoint, then sends only pending recipes to the locked batch mutation.
The server records them as manual recipes confirmed by the authenticated user.
If a concurrent writer creates an identical recipe, it becomes an unchanged
skip; a different recipe conflicts before that batch writes. A network
interruption can leave a safe partial application; rerun the plan. Completed
identical rows are skipped and different rows remain protected.

## Verification

1. Require the apply summary's `verifiedVariants` to equal `resolvedVariants`
   from the plan and `pendingVariants` to become zero on a second plan.
2. Open `/product-hub/matching` for the staging account and confirm recipe
   coverage increased by the applied count.
3. Inspect representative exact-name, option-specific, and multi-component
   recipes on product detail.
4. Confirm Sellpia `currentStock` and import timestamps did not change.
5. Run the same plan again; it must report every resolved recipe as unchanged.

Repository verification for changes to the transfer tool is:

```bash
rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/transfer-channel-recipes.spec.ts
rtk npm exec vitest -- run --config vitest.config.ts src/schemas/product-operations.spec.ts # from packages/shared
rtk npm exec vitest -- run --config vitest.config.ts src/products/application/service/product-operations.service.spec.ts src/products/adapter/in/http/product-operations.controller.spec.ts src/products/__tests__/products.architecture.spec.ts # from apps/server
rtk npm run check:scripts-inventory
rtk npm run test:scripts
rtk npm run dev:server
```

## Rollback And Blockers

The tool never deletes or replaces a non-empty recipe and has no bulk rollback
mode. If an approved artifact itself is wrong, stop further application and
correct the affected complete recipes on product detail with an operator. Do
not use raw SQL or a second guessed artifact as rollback.

Block when:

- authentication or the exact organization gate fails;
- staging is not the explicitly intended target or uses a localhost URL;
- collection is incomplete in either environment;
- stable channel identities or active Sellpia codes do not resolve exactly;
- one target variant resolves to conflicting artifact recipes;
- a different recipe already exists;
- any quantity or multi-component BOM was not explicitly reviewed.

## Final Report

```text
Environment: <local export | staging plan | staging apply>
Verified organization: approved <uuid>; observed <uuid>; exact match <yes|no>
Artifact: private path <path>; options <count>; Sellpia codes <count>
Resolution: variants <count>; pending <count>; unchanged <count>
Apply: requested <count>; applied <count>; verified <count>
Existing different recipes overwritten: 0
Sellpia stock writes: 0
Second plan pending: <count>
Blockers: <none or exact blocker>
```
