# Chrome Extension Releases

## Purpose

Package all KidItem Chrome extensions as universal artifacts that support local,
office, and staging simultaneously, then publish them together in the GitHub Release
for the staging deployment tag. Publishing is manual; there is no GitHub
Actions extension-publishing workflow.
GitHub Packages/GHCR remains for server images and is not an extension
distribution channel.

Each extension keeps an independent Chrome manifest version inside the bundle:

| Extension | Source of truth |
|---|---|
| Product sourcing | `extensions/product-scraper/manifest.json` |
| Coupang Wing and ads | `extensions/coupang-ads-scraper/manifest.json` |
| Order and inventory collection | `extensions/order-collector/manifest.json` |

Root `VERSION` remains the deployable application release train. The public
distribution unit is one `staging-v<VERSION>-<date>-<sha>` Release containing
one ZIP with all three extension directories.

## Universal Environment Contract

- One installed copy supports local web/API at `http://localhost:3000` /
  `http://localhost:4000`, office web/API at `http://kiditem-office`, and
  staging web/API at
  `https://staging.merchon.org`.
- The verified external sender origin selects the environment profile. A caller
  cannot choose another environment by sending an environment id.
- Auth profiles, runs, status, tabs, alarms, caches, and callbacks remain bound
  to their owning environment, so local, office, and staging operations may run
  at the same time.
- The packager never rewrites origins or runtime code. It copies every loadable
  source file byte-for-byte, omitting only agent documentation and hidden files.
- Do not create or maintain environment-specific source/package variants.

## Prerequisites

- Work from a clean local `main` that exactly matches `origin/main` and the
  staging deployment tag before publishing.
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
5. A published deployment tag and its ZIP asset are immutable. A correction is
   included in a later staging deployment bundle; never replace prior assets.

Bundle Release tags are the staging deployment tags created by the deployment
workflow:

```text
staging-v<VERSION>-<YYYYMMDD>-<short-sha>
```

## Pack Without Publishing

Create a universal local package:

```bash
npm run extension:release -- pack \
  --deployment-tag staging-v0.1.26-20260725-58dacdef
```

This always packages `product-scraper`, `coupang-ads-scraper`, and
`order-collector`. Use `--output-dir <path>` only when the default ignored
output root is unsuitable. Per-extension packaging is intentionally unsupported.

The default output layout is:

```text
output/extensions/bundles/<deployment-tag>/
├── unpacked/
│   ├── product-scraper/
│   ├── coupang-ads-scraper/
│   └── order-collector/
└── kiditem-scrapers-<deployment-tag>.zip
```

The command output records the deployment tag, Git SHA, environments, and the
manifest version of each contained extension for operator inspection. Only the
combined ZIP is uploaded as a GitHub Release asset. Verify it before publishing:

```bash
DEPLOYMENT_TAG="staging-v<VERSION>-<YYYYMMDD>-<short-sha>"
RELEASE_DIR="output/extensions/bundles/$DEPLOYMENT_TAG"

unzip -t "$RELEASE_DIR/kiditem-scrapers-$DEPLOYMENT_TAG.zip"
```

## Create A Draft GitHub Release

Publishing defaults to a draft so the operator can inspect the tag, SHA, and
combined archive before making it visible:

```bash
git switch main
git pull --ff-only origin main

npm run extension:release -- publish \
  --deployment-tag "$DEPLOYMENT_TAG"
```

The publisher refuses to run unless the worktree is clean and `HEAD` exactly
matches `origin/main`, and the deployment tag points to that exact SHA. It
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

The GitHub Release ZIP is a bundle of three manual unpacked-extension packages;
Chrome does not install the ZIP directly.

1. Open the intended staging deployment Release and download its ZIP.
2. Test and extract it once into a stable directory. The result contains
   `product-scraper/`, `coupang-ads-scraper/`, and `order-collector/`.
3. Open `chrome://extensions`, enable Developer mode, and choose **Load
   unpacked** for each of those three directories.
4. For an update, replace the directory contents and click **Reload** on the
   existing extension card. Do not leave old and new copies enabled together.
5. Reload each open KidItem page. Confirm local, office, and staging handshakes
   report the expected extension version and environment-profile capability.
6. Visit and authenticate each KidItem origin whose profile is needed.
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

1. Extract the bundle once and load each of its three extension directories.
2. Open the local, office, and staging KidItem pages in the same Chrome profile.
3. Confirm all pages discover the same installed extension/version.
4. Authenticate the profiles and confirm each page reports its own connected
   environment.
5. Start safe read-only work from each environment and confirm status,
   cancellation, and completion callbacks never cross environments.
6. For extensions with a popup, verify no profile shows the empty state, one
   profile auto-selects, and two profiles require an explicit selection.
