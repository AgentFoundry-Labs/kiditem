# Coupang Scraper Publish Runbook

Use this runbook after a human or agent has run the Coupang scraper and has
scraper output JSON files ready on the local machine. The goal is to publish a
replayable dev-data bundle to Google Drive so teammates can reproduce the same
local DB/UI state.

Related docs:

- [Google Drive Dev Data Runbook](google-drive-dev-data.md) — first-time Drive
  setup.
- [Dev Data Profiles and Bundles](../DEV_DATA_BUNDLES.md) — bundle contract,
  replay semantics, and verification manual.

## Human Prerequisites

- The scraper runner has access to Coupang Wing/ads pages and has already run
  the scraper.
- The scraper output JSON files are available in one local directory.
- The runner has Editor access to the shared `KidItem Dev Data` Google Drive
  folder.
- Google Drive Desktop setup has already been completed with
  [google-drive-dev-data.md](google-drive-dev-data.md).

## Required Inputs

The agent needs these values before publishing:

```text
PAYLOAD_DIR=/absolute/or/repo-relative/path/to/scraper-output/coupang
DATASET_ID=YYYY-MM-DD-vN
DATE_FROM=YYYY-MM-DD
DATE_TO=YYYY-MM-DD
```

Rules:

- Use `DATASET_ID=YYYY-MM-DD-vN`, for example `2026-05-01-v1`.
- If the same date range is republished, increment `vN`; do not overwrite the
  meaning of an existing dataset.
- `DATE_FROM` and `DATE_TO` must match the business-date range represented by
  the scraper payloads.
- If the payload date range cannot be inferred from file names or payload
  content, ask the human for the date range.

## Agent Publish Steps

1. Confirm the repo and Drive setup.

   ```bash
   pwd
   test -f package.json
   test -f docs/runbooks/coupang-scraper-publish.md
   npm run data:dev:setup -- --drive-root "$KIDITEM_DEV_DATA_DRIVE_DIR"
   npm run data:dev:status
   ```

2. Inspect the payload directory.

   ```bash
   find "$PAYLOAD_DIR" -maxdepth 1 -type f -name '*.json' -print | sort
   ```

   Block if there are no JSON files. Do not invent payloads or publish
   synthetic seed data.

3. Export the local bundle.

   ```bash
   npm run data:dev:export -- \
     --domain coupang \
     --dataset "$DATASET_ID" \
     --payload-dir "$PAYLOAD_DIR" \
     --from "$DATE_FROM" \
     --to "$DATE_TO" \
     --data-root .data/dev
   ```

   `data:dev:export` automatically snapshots the project reference files from
   Drive root into the bundle when `KIDITEM_DEV_DATA_DRIVE_DIR` is configured:

   - `references/kiditem_list.xlsx`
   - `references/wing-inventory-matched.xlsx`

4. Inspect the generated manifest.

   ```bash
   test -f ".data/dev/coupang/$DATASET_ID/manifest.json"
   node -e "const dataset=process.argv[1]; const m=require('./.data/dev/coupang/' + dataset + '/manifest.json'); console.log(JSON.stringify({datasetId:m.datasetId, scope:m.scope, payloads:m.payloads?.map(p=>({path:p.path,type:p.type,rowCount:p.rowCount})), references:m.references?.map(r=>({path:r.path,type:r.type,bytes:r.bytes}))}, null, 2))" "$DATASET_ID"
   ```

   Success criteria:

   - `datasetId` matches `DATASET_ID`.
   - `scope.businessDateFrom` matches `DATE_FROM`.
   - `scope.businessDateTo` matches `DATE_TO`.
   - `payloads` is non-empty.
   - `references` includes `kiditem_list` and `wing_inventory_matched`.

5. Publish to Google Drive.

   ```bash
   npm run data:dev:publish -- \
     --domain coupang \
     --dataset "$DATASET_ID" \
     --data-root .data/dev
   ```

   This writes:

   ```text
   KidItem Dev Data/coupang/latest.json
   KidItem Dev Data/coupang/latest.txt
   KidItem Dev Data/coupang/bundles/kiditem-coupang-{DATASET_ID}.zip
   KidItem Dev Data/coupang/bundles/kiditem-coupang-{DATASET_ID}.zip.sha256
   KidItem Dev Data/coupang/bundles/kiditem-coupang-{DATASET_ID}.zip.json
   ```

6. Verify the published bundle can be pulled.

   ```bash
   CHECK_ROOT="$(mktemp -d)"
   npm run data:dev:pull -- \
     --domain coupang \
     --dataset "$DATASET_ID" \
     --data-root "$CHECK_ROOT"
   test -f "$CHECK_ROOT/coupang/$DATASET_ID/manifest.json"
   test -f "$CHECK_ROOT/coupang/$DATASET_ID/references/kiditem_list.xlsx"
   test -f "$CHECK_ROOT/coupang/$DATASET_ID/references/wing-inventory-matched.xlsx"
   ```

   This is a pull/check only. It does not replay into the local DB.

7. Share the publication summary with the team.

   ```text
   Coupang dev data published
   - dataset: YYYY-MM-DD-vN
   - date range: YYYY-MM-DD..YYYY-MM-DD
   - payloads: <type/count summary from manifest>
   - project references: kiditem_list.xlsx, wing-inventory-matched.xlsx
   - expected focus: inventory mismatch / ad dashboard / item winner / DB schema change check
   - known gaps: ...
   ```

## Blockers

Stop and ask the human when:

- `KIDITEM_DEV_DATA_DRIVE_DIR` is missing and the Drive folder cannot be found.
- Google Drive Desktop is not installed or the folder is not shared locally.
- The publisher does not have write permission to the Drive folder.
- `PAYLOAD_DIR` has no JSON files.
- `DATE_FROM` / `DATE_TO` cannot be determined.
- The project reference files are missing from both Drive and the source
  directory.

## Final Report

```text
Coupang scraper publish
- dataset: YYYY-MM-DD-vN
- date range: YYYY-MM-DD..YYYY-MM-DD
- payload dir: ...
- payload count: N
- references: kiditem_list.xlsx, wing-inventory-matched.xlsx
- published files: latest.json, latest.txt, bundle zip, sha256, bundle metadata
- pull verification: passed or failed
- blocker: only if publish did not complete
```
