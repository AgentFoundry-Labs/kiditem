# Chrome Extension Releases

## Purpose

Package and publish each KidItem Chrome extension as one universal artifact
that supports local and staging simultaneously. Publishing is a manual GitHub
Release operation; there is no GitHub Actions extension-publishing workflow.
GitHub Packages/GHCR remains for server images and is not an extension
distribution channel.

Each extension owns its independent Chrome manifest version:

| Extension | Source of truth |
|---|---|
| Product sourcing | `extensions/product-scraper/manifest.json` |
| Coupang Wing and ads | `extensions/coupang-ads-scraper/manifest.json` |
| Order and inventory collection | `extensions/order-collector/manifest.json` |

Root `VERSION` remains the deployable application release train. Do not bump it
only to publish an extension.

## Universal Environment Contract

- One installed copy supports local web/API at `http://localhost:3000` /
  `http://localhost:4000` and staging web/API at
  `https://staging.merchon.org`.
- The verified external sender origin selects the environment profile. A caller
  cannot choose another environment by sending an environment id.
- Auth profiles, runs, status, tabs, alarms, caches, and callbacks remain bound
  to their owning environment, so local and staging operations may run at the
  same time.
- The packager never rewrites origins or runtime code. It copies every loadable
  source file byte-for-byte, omitting only agent documentation and hidden files.
- Do not create or maintain local-only or staging-only source/package variants.

## Prerequisites

- Work from a clean local `main` that exactly matches `origin/main` before
  publishing.
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
4. Merge the versioned source to `main` before publishing.
5. A published tag and its assets are immutable. A correction receives a
   higher manifest version; never replace a prior Release asset.

Release tags use this format:

```text
extension-<directory>-v<manifest-version>
```

## Pack Without Publishing

Create a universal local package:

```bash
npm run extension:release -- pack \
  --extension coupang-ads-scraper
```

Supported extension names are `product-scraper`, `coupang-ads-scraper`, and
`order-collector`. Use `--output-dir <path>` only when the default ignored
output root is unsuitable.

The default output layout is:

```text
output/extensions/<extension>/<version>/universal/
├── unpacked/
├── kiditem-<extension>-v<version>.zip
├── kiditem-<extension>-v<version>.zip.sha256
└── kiditem-<extension>-v<version>.release.json
```

The metadata uses `kiditem.extension.release.v2`, records the universal target,
the local/staging environment profiles, the current Git SHA, and the archive
hash. Verify the local artifact before publishing:

```bash
RELEASE_DIR="output/extensions/coupang-ads-scraper/<version>/universal"
ASSET="kiditem-coupang-ads-scraper-v<version>"

(cd "$RELEASE_DIR" && shasum -a 256 -c "$ASSET.zip.sha256")
unzip -l "$RELEASE_DIR/$ASSET.zip"
```

## Create A Draft GitHub Release

Publishing defaults to a draft so the operator can inspect the tag, SHA,
archive, checksum, and metadata before making it visible:

```bash
git switch main
git pull --ff-only origin main

npm run extension:release -- publish \
  --extension coupang-ads-scraper
```

The publisher refuses to run unless the worktree is clean and `HEAD` exactly
matches `origin/main`. It refuses to replace an existing Release tag and marks
extension Releases as prerelease and non-latest so they do not replace the
repository's application-level Latest release.

Inspect and publish the draft:

```bash
TAG="extension-coupang-ads-scraper-v<version>"

gh release view "$TAG"
gh release edit "$TAG" --draft=false --prerelease --latest=false
```

An operator may publish immediately only after completing the same inspection
against a local package:

```bash
npm run extension:release -- publish \
  --extension coupang-ads-scraper \
  --release-state published
```

Use `--dry-run true` to print and verify the complete `gh release create`
command without mutating GitHub.

## Install Or Update

GitHub Release ZIP files are manual unpacked-extension packages; Chrome does
not install the ZIP directly.

1. Download the ZIP and matching `.sha256` file from the intended Release.
2. Verify the checksum.
3. Extract it into a stable directory that is not deleted between restarts.
4. Open `chrome://extensions`, enable Developer mode, and choose **Load
   unpacked** for a first install.
5. For an update, replace the directory contents and click **Reload** on the
   existing extension card. Do not leave old and new copies enabled together.
6. Reload each open KidItem page. Confirm local and staging handshakes report
   the expected extension version and environment-profile capability.
7. Visit and authenticate both KidItem origins when both profiles are needed.
   Marketplace login and OTP stay in the operator's normal Chrome profile.

## Verification

Run repository checks before publishing:

```bash
npm run check:scripts-inventory
npm run test:scripts
node --test extensions/tests/*.test.mjs
node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('extensions/order-collector/manifest.json','utf8'))"
git diff --check
```

Manual acceptance for the released extension:

1. Load the package from its `unpacked/` directory.
2. Open both the local and staging KidItem pages in the same Chrome profile.
3. Confirm both pages discover the same installed extension/version.
4. Authenticate both profiles and confirm each page reports its own connected
   environment.
5. Start safe read-only work from each environment and confirm status,
   cancellation, and completion callbacks never cross environments.
6. For extensions with a popup, verify no profile shows the empty state, one
   profile auto-selects, and two profiles require an explicit selection.
