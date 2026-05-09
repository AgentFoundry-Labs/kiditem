# Google Drive Dev Data Runbook

Use this runbook to set up KidItem shared development data on a machine. It is
designed for an AI agent to execute after the human has installed and logged in
to Google Drive Desktop.

Canonical Drive folder:

<https://drive.google.com/drive/folders/1sIuAiZAX6wAFOoEmmJGe6p0b5xwey1AO?usp=drive_link>

Related concept and operations doc:

- [Dev Data Profiles and Bundles](../DEV_DATA_BUNDLES.md)

## Human Prerequisites

- Install Google Drive Desktop and log in with the team member's own Google
  account. Do not use a shared Google account.
- Confirm the `KidItem Dev Data` folder is shared with that Google account.
- Grant Editor access to anyone who will publish scraper bundles or update
  project reference files.
- Viewer access is enough for pull/replay-only consumers, as long as Drive
  Desktop exposes the folder locally.
- If the folder appears only in "Shared with me", open Google Drive web and add
  a shortcut for `KidItem Dev Data` to the user's `My Drive`.

## Expected Drive Shape

```text
KidItem Dev Data/
├── profiles/
│   ├── workspace.json
│   └── coupang.json
├── references/
│   ├── kiditem_list.xlsx
│   └── wing-inventory-matched.xlsx
└── coupang/
    ├── latest.json
    ├── latest.txt
    └── bundles/
```

`latest.json` and `latest.txt` may be absent until the first scraper bundle is
published.

Bundles may include `payloads/coupang-image-sync-from-db.json` when a publisher
has run Wing image sync. That file stores replayable Wing image rows and
external Coupang CDN URLs, not image binaries or local object-storage URLs.

## Agent Setup Steps

1. Confirm the repo root.

   ```bash
   pwd
   test -f package.json
   test -f docs/DEV_DATA_BUNDLES.md
   test -f docs/runbooks/google-drive-dev-data.md
   ```

2. Find the local Google Drive Desktop folder. The CLI also auto-discovers this
   path on macOS by scanning `~/Library/CloudStorage/**/KidItem Dev Data` and
   ignores Google Drive Desktop `.Encrypted` mirrors.

   ```bash
   find "$HOME/Library/CloudStorage" -maxdepth 5 -type d -name "KidItem Dev Data" -print 2>/dev/null
   ```

   On Korean macOS, the path may look like:

   ```text
   ~/Library/CloudStorage/GoogleDrive-<account>/내 드라이브/KidItem Dev Data
   ```

   On Windows or Linux, search the local Google Drive Desktop mount/sync path
   for the same folder name.

3. Set the repo `.env` value only when auto-discovery cannot choose a single
   visible folder. Do not print the full `.env`; it may contain secrets.

   ```bash
   KIDITEM_DEV_DATA_DRIVE_DIR="/absolute/path/to/KidItem Dev Data"
   ```

4. Run the setup command. This creates missing directories, creates default
   profiles when absent, validates existing profiles, and copies project
   reference files from the repo root into Drive when Drive is missing them.

   ```bash
   npm run data:dev:setup
   ```

   If the reference files live somewhere other than the repo root, pass that
   source directory explicitly:

   ```bash
   npm run data:dev:setup -- \
     --reference-source-root "/absolute/path/to/reference/files"
   ```

   If auto-discovery is ambiguous or unavailable, pass
   `--drive-root "$KIDITEM_DEV_DATA_DRIVE_DIR"` to the setup/sync/status
   commands.

5. If setup reports blockers, handle them before continuing. The manual
   structure below is the expected result of the setup command.

   ```bash
   mkdir -p "$KIDITEM_DEV_DATA_DRIVE_DIR/profiles"
   mkdir -p "$KIDITEM_DEV_DATA_DRIVE_DIR/references"
   mkdir -p "$KIDITEM_DEV_DATA_DRIVE_DIR/coupang/bundles"
   ```

6. Ensure `profiles/workspace.json` exists. If the file already exists, validate
   it instead of overwriting it.

   ```json
   {
     "schemaVersion": "kiditem.dev-data.profile.v1",
     "profileId": "workspace",
     "description": "Default local workspace data from real Coupang scraper payloads",
     "steps": [
       { "domain": "coupang", "dataset": "latest", "mode": "scoped-replace" }
     ]
   }
   ```

7. Ensure `profiles/coupang.json` exists. If the file already exists, validate
   it instead of overwriting it.

   ```json
   {
     "schemaVersion": "kiditem.dev-data.profile.v1",
     "profileId": "coupang",
     "description": "Real Coupang scraper payload replay profile",
     "steps": [
       { "domain": "coupang", "dataset": "latest", "mode": "scoped-replace" }
     ]
   }
   ```

8. Confirm the project reference files are present.

   ```bash
   test -f "$KIDITEM_DEV_DATA_DRIVE_DIR/references/kiditem_list.xlsx"
   test -f "$KIDITEM_DEV_DATA_DRIVE_DIR/references/wing-inventory-matched.xlsx"
   ```

   If a file exists in the repo root but not in Drive, copy it into Drive. If it
   is missing in both places, ask the human for the latest source file.

9. Verify the CLI sees Drive. This should work without `--drive-root` on a
   normal macOS Google Drive Desktop install.

   ```bash
   npm run data:dev:status
   ```

   Success criteria:

   - `configuredDriveRoot` is the absolute `KidItem Dev Data` path.
   - `profiles` includes `workspace.json` and `coupang.json`.

10. If `coupang/latest.json` exists, dry-run the sync plan.

   ```bash
   npm run data:dev:sync -- --profile workspace --dry-run
   ```

   If no bundle has been published yet, `sync` may fail because `latest.json` is
   absent. That is not a setup failure.

## Final Report

```text
KidItem dev data Drive setup
- drive root: /absolute/path/to/KidItem Dev Data
- profiles: workspace.json, coupang.json
- project references: kiditem_list.xlsx, wing-inventory-matched.xlsx
- coupang bundles dir: exists
- latest bundle: present or not present
- verification: npm run data:dev:status ...
- blocker: only if Drive Desktop/login/share permission/reference files are missing
```
