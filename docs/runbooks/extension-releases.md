# Chrome Extension Releases

## Purpose

Package the KidItem Chrome extension as a universal artifact that supports
local and Office simultaneously, then publish it in the GitHub Release for the
Office deployment tag. Publishing is manual; there is no GitHub
Actions extension-publishing workflow.
GitHub Packages/GHCR remains for server images and is not an extension
distribution channel.

Order collection, Coupang Wing/ads, and product sourcing shipped as three
separate extensions until they were merged; they are now three domains inside
one extension with one Chrome manifest version:

| Extension | Source of truth |
|---|---|
| KIDITEM OS (order collection + Coupang + sourcing) | `extensions/kiditem-os/manifest.json` |

Root `VERSION` remains the deployable application release train. The public
distribution unit is one `office-v<VERSION>-<date>-<sha>` Release containing
one ZIP with the extension directory.

## Universal Environment Contract

- One installed copy supports local web/API at `http://localhost:3000` /
  `http://localhost:4000` and Office web/API at `http://kiditem-office`.
- The verified external sender origin selects the environment profile. A caller
  cannot choose another environment by sending an environment id.
- Auth profiles, runs, status, tabs, alarms, caches, and callbacks remain bound
  to their owning environment, so local and Office operations may run at the
  same time.
- The packager never rewrites origins or runtime code. It copies every loadable
  source file byte-for-byte, omitting only agent documentation and hidden files.
- The TypeScript runtime bundle `runtime/kiditem-runtime.js` is committed, so
  the packager copies it like any other file and never builds. Releasing a
  stale bundle (a `src/` change or version bump without
  `npm run extension:build`) is blocked by `npm run extension:check` in CI.
- Do not create or maintain environment-specific source/package variants.

## Prerequisites

- Work from a clean local `release/office` that exactly matches
  `origin/release/office` and the Office deployment tag before publishing.
- Install and authenticate GitHub CLI with repository release permission.
- Keep the `zip` CLI available on `PATH`.
- Never place tokens, cookies, marketplace credentials, or browser session data
  in an artifact.
- Complete focused automated and manual browser checks before increasing the
  changed extension's version.

## Version Rules

1. Increase the changed extension's `manifest.json` version whenever runtime
   JavaScript, manifest permissions, content scripts, or operator-visible
   behavior changes.
2. Chrome versions are one to four dot-separated non-negative integers.
3. Update tests that deliberately lock the exact manifest version.
   Run `npm run extension:build` and commit the regenerated
   `runtime/kiditem-runtime.js`, which embeds the manifest version.
4. Merge the versioned source to `main` before publishing.
5. A published deployment tag and its ZIP asset are immutable. A correction is
   included in a later Office deployment bundle; never replace prior assets.

Bundle Release tags identify the Office release train and exact source SHA:

```text
office-v<VERSION>-<YYYYMMDD>-<short-sha>
```

## Pack Without Publishing

Create a universal local package:

```bash
npm run extension:release -- pack \
  --deployment-tag office-v0.1.26-20260725-58dacdef
```

This always packages `kiditem-os`. Use `--output-dir <path>` only when the
default ignored output root is unsuitable. Per-extension packaging is
intentionally unsupported.

The default output layout is:

```text
output/extensions/bundles/<deployment-tag>/
├── unpacked/
│   └── kiditem-os/
└── kiditem-scrapers-<deployment-tag>.zip
```

The command output records the deployment tag, Git SHA, environments, and the
contained extension's manifest version for operator inspection. Only the
combined ZIP is uploaded as a GitHub Release asset. Verify it before publishing:

```bash
DEPLOYMENT_TAG="office-v<VERSION>-<YYYYMMDD>-<short-sha>"
RELEASE_DIR="output/extensions/bundles/$DEPLOYMENT_TAG"

unzip -t "$RELEASE_DIR/kiditem-scrapers-$DEPLOYMENT_TAG.zip"
```

## Create A Draft GitHub Release

Publishing defaults to a draft so the operator can inspect the tag, SHA, and
combined archive before making it visible:

```bash
git switch release/office
git pull --ff-only origin release/office

npm run extension:release -- publish \
  --deployment-tag "$DEPLOYMENT_TAG"
```

The publisher refuses to run unless the worktree is clean and `HEAD` exactly
matches `origin/release/office`, and the deployment tag points to that exact SHA. It
refuses to replace an existing Release and marks bundle Releases as prerelease
and non-latest so they do not replace the
repository's application-level Latest release.

Inspect and publish the draft:

```bash
gh release view "$DEPLOYMENT_TAG"
gh release edit "$DEPLOYMENT_TAG" --draft=false --prerelease --latest=false
```

An operator may publish immediately only after completing the same inspection
against a local package:

```bash
npm run extension:release -- publish \
  --deployment-tag "$DEPLOYMENT_TAG" \
  --release-state published
```

Use `--dry-run true` to print and verify the complete `gh release create`
command without mutating GitHub.

## Install Or Update

The GitHub Release ZIP is a manual unpacked-extension package; Chrome does not
install the ZIP directly.

1. Open the intended Office deployment Release and download its ZIP.
2. Test and extract it once into a stable directory. The result contains
   `kiditem-os/`.
3. Open `chrome://extensions`, enable Developer mode, and choose **Load
   unpacked** for that directory.
4. For an update, replace the directory contents and click **Reload** on the
   existing extension card. Do not leave old and new copies enabled together.
   Operators upgrading from the pre-merge bundle must remove the three old
   extensions; leaving them loaded means two extensions answer the same KidItem
   handshake and the web app may bind to the stale one. Stored auth is not
   carried over, so re-authenticate each KidItem environment once.
5. Reload each open KidItem page. Confirm local and Office handshakes
   report the expected extension version and environment-profile capability.
6. Visit and authenticate each KidItem origin whose profile is needed.
   Marketplace login and OTP stay in the operator's normal Chrome profile.

## Extension ID (Manifest `key`)

`extensions/kiditem-os/manifest.json` carries a `key` (the base64 DER public
key), so Chrome derives the same extension ID,
`jdklckncgmllpabkofllidmoiglbcnpb`, from every unpacked directory on every
machine. Without it the directory path chose the ID.

- The private key is not kept anywhere. KidItem ships only unpacked loads,
  which need just the public key, so no CRX signing is needed. If signed
  distribution (a CRX or a Web Store upload) is ever needed, generate a new key
  pair and change the ID once.
- Do not edit or remove `key`. Rotation is a deliberate ID change: generate a
  pair, replace only the `key` value, and discard the PEM:

  ```bash
  openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out kiditem-os.pem
  openssl rsa -in kiditem-os.pem -pubout -outform DER | openssl base64 -A
  ```

### One-Time Reconnection After The ID Changes

The first release that adds (or rotates) `key` changes the installed ID once.
What depends on the ID:

- `chrome.storage.local` belongs to one ID, so KidItem auth profiles, collection
  sessions, and caches of the old ID are not carried over.
- The web app does not store a fixed ID: `content/host-bridge.js` rewrites the
  `kiditem-*-ext-id` localStorage entries with `chrome.runtime.id` on every
  KidItem page load, so the web app follows the new ID after a page reload.
- `externally_connectable` matches KidItem web origins, not extension IDs, and
  the server keeps no extension-ID allowlist, so neither needs a change.

Operator procedure: finish or cancel running collections, **Remove** the old
extension card, **Load unpacked** the new directory, reload every open KidItem
page, then re-authenticate each KidItem environment once (install steps 5-6).

## Verification

Run repository checks before publishing:

```bash
npm run check:scripts-inventory
npm run test:scripts
npm run extension:check
npm run extension:test
node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))"
git diff --check
```

Manual acceptance for the released extension:

1. Extract the bundle once and load its extension directory.
2. Open the local and Office KidItem pages in the same Chrome profile.
3. Confirm all pages discover the same installed extension/version.
4. Authenticate the profiles and confirm each page reports its own connected
   environment.
5. Start safe read-only work from each environment and confirm status,
   cancellation, and completion callbacks never cross environments.
6. For extensions with a popup, verify no profile shows the empty state, one
   profile auto-selects, and two profiles require an explicit selection.
