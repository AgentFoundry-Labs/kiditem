# Import Drive Reference Data Runbook

Use this runbook when an AI agent needs to load the two project reference
Excel files from Google Drive into a local KidItem database.

This is separate from Coupang scraper bundle replay. Scraper replay loads
scraper payload JSON through the server ingest path. This runbook loads the
project baseline Excel files into catalog, inventory, supplier, and Coupang
listing mapping tables.

## Human Prerequisites

- Google Drive Desktop is installed and logged in.
- The shared `KidItem Dev Data` folder is visible locally.
- Local PostgreSQL is running and the Prisma schema has been applied.
- This runbook is for a local development database. If the DB has no
  organization, the agent is authorized to create the standard local dev
  organization described below. Do not run this bootstrap against production or
  shared staging.

## Inputs

Default Drive paths:

```text
KidItem Dev Data/
└── references/
    ├── kiditem_list.xlsx
    └── wing-inventory-matched.xlsx
```

`scripts/import-product-baseline.ts` uses these files automatically when
`KIDITEM_DEV_DATA_DRIVE_DIR` is set. Manual overrides are still available:

- `--drive-root /absolute/path/to/KidItem Dev Data`
- `--reference-dir /absolute/path/to/references`
- `--kiditem-list /absolute/path/to/kiditem_list.xlsx`
- `--wing-inventory-matched /absolute/path/to/wing-inventory-matched.xlsx`

Legacy aliases `--kiditem` and `--wing` also work.

## Agent Steps

1. Confirm the repo and Drive setup.

   ```bash
   pwd
   test -f package.json
   npm run data:dev:status
   ```

2. Set the Drive root if it is not already in `.env` or the shell.

   ```bash
   export KIDITEM_DEV_DATA_DRIVE_DIR="/absolute/path/to/KidItem Dev Data"
   test -f "$KIDITEM_DEV_DATA_DRIVE_DIR/references/kiditem_list.xlsx"
   test -f "$KIDITEM_DEV_DATA_DRIVE_DIR/references/wing-inventory-matched.xlsx"
   ```

3. Ensure DB/schema/client are current.

   ```bash
   docker compose up -d
   npm install
   npm run db:generate
   npm run db:push
   ```

4. Resolve or create the local development organization.

   Prefer a provided `KIDITEM_DEV_ORGANIZATION_ID`. If it is missing, inspect
   local organizations:

   ```bash
   docker exec kiditem-postgres psql -U kiditem -d kiditem -c "select id, name, created_at from organizations order by created_at desc;"
   ```

   If the result is empty, create the standard fresh-DB organization. This is
   an expected local-dev mutation and does not need another human approval when
   this runbook is the assigned task.

   ```bash
   export KIDITEM_DEV_ORGANIZATION_ID="00000000-0000-4000-8000-000000000001"

   docker exec kiditem-postgres psql -U kiditem -d kiditem -v ON_ERROR_STOP=1 -c "
   insert into organizations (id, name, slug)
   values ('$KIDITEM_DEV_ORGANIZATION_ID', 'KidItem Dev', 'kiditem-dev')
   on conflict (slug) do update set name = excluded.name
   returning id, name, slug;
   "
   ```

   If an organization already exists, use its id instead:

   ```bash
   export KIDITEM_DEV_ORGANIZATION_ID="<existing organization uuid>"
   ```

5. Run dry-run first.

   ```bash
   npm run import:product-baseline -- --organization-id "$KIDITEM_DEV_ORGANIZATION_ID"
   ```

   Success criteria:

   - `mode` is `dry-run`.
   - `inputs.kiditemPath` points to Drive `references/kiditem_list.xlsx`.
   - `inputs.wingPath` points to Drive `references/wing-inventory-matched.xlsx`.
   - `kiditem.hardConflicts` is `0`.
   - `wing.reportSample` has no unexpected high-volume mismatch pattern.

6. Write to DB only after dry-run is clean.

   ```bash
   npm run import:product-baseline -- \
     --organization-id "$KIDITEM_DEV_ORGANIZATION_ID" \
     --write
   ```

7. Verify row counts.

   ```bash
   docker exec kiditem-postgres psql -U kiditem -d kiditem -c "
   select 'master_products' as table_name, count(*) from master_products where organization_id = '$KIDITEM_DEV_ORGANIZATION_ID'
   union all
   select 'product_options', count(*) from product_options where organization_id = '$KIDITEM_DEV_ORGANIZATION_ID'
   union all
   select 'inventory', count(*) from inventory where organization_id = '$KIDITEM_DEV_ORGANIZATION_ID'
   union all
   select 'suppliers', count(*) from suppliers where organization_id = '$KIDITEM_DEV_ORGANIZATION_ID'
   union all
   select 'coupang_listings', count(*) from channel_listings where organization_id = '$KIDITEM_DEV_ORGANIZATION_ID' and channel = 'coupang';
   "
   ```

8. Start the app and smoke-check catalog/inventory/Coupang pages.

   ```bash
   npm run dev:server
   npm run dev
   ```

## Final Report

```text
Drive reference import
- drive root: /absolute/path/to/KidItem Dev Data
- organization: <uuid>
- inputs: references/kiditem_list.xlsx, references/wing-inventory-matched.xlsx
- dry-run: hardConflicts=0, planned masters/options/inventory/listings=...
- write: completed or skipped
- verification: row counts + UI smoke result
- blockers: ...
```
