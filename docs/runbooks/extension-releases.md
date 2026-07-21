# Chrome Extension Releases

## Purpose

Package and publish KidItem Chrome extensions through manual GitHub Releases.
This path intentionally has no GitHub Actions publishing workflow. GitHub
Packages/GHCR remains for server container images and is not an extension
distribution channel. Staging-targeted extension builds are published as
GitHub prereleases so they never replace the repository's application-level
Latest release.

Each extension owns its independent Chrome manifest version:

| Extension                      | Source of truth                                |
| ------------------------------ | ---------------------------------------------- |
| Product sourcing               | `extensions/product-scraper/manifest.json`     |
| Coupang Wing and ads           | `extensions/coupang-ads-scraper/manifest.json` |
| Order and inventory collection | `extensions/order-collector/manifest.json`     |

Root `VERSION` remains the deployable application release train. Do not bump it
only to publish an extension.

## Prerequisites

- Work from a clean local `main` that exactly matches `origin/main` before
  publishing.
- Install and authenticate GitHub CLI with repository release permission.
- Keep the `zip` CLI available on `PATH`.
- Read `STAGING_URL` from the GitHub `staging` Environment. Never place tokens,
  cookies, marketplace credentials, or browser session data in an artifact.
- Complete the focused automated and manual browser checks for the changed
  extension before increasing its version.

## Version Rules

1. Increase the changed extension's `manifest.json` version whenever its
   runtime JavaScript, manifest permissions, content scripts, or operator-visible
   behavior changes.
2. Chrome versions are one to four dot-separated non-negative integers.
3. Update tests that deliberately lock the exact manifest version.
4. Merge the versioned source to `main` before publishing.
5. A published tag and its assets are immutable. A correction always receives
   a higher manifest version; never replace a prior Release asset.

Release tags use this format:

```text
extension-<directory>-v<manifest-version>-staging
```

Example:

```text
extension-coupang-ads-scraper-v1.2.66-staging
```

## Pack Without Publishing

Resolve the exact service origin and create a local package:

```bash
STAGING_URL="$(gh variable get STAGING_URL --env staging)"

npm run extension:release -- pack \
  --extension coupang-ads-scraper \
  --target staging \
  --web-origin "$STAGING_URL" \
  --api-origin "$STAGING_URL"
```

Supported extension names are:

```text
product-scraper
coupang-ads-scraper
order-collector
```

The ignored output directory is:

```text
output/extensions/<extension>/<version>/staging/
├── unpacked/
├── kiditem-<extension>-v<version>-staging.zip
├── kiditem-<extension>-v<version>-staging.zip.sha256
└── kiditem-<extension>-v<version>-staging.release.json
```

The packager removes committed agent documentation, rewrites KidItem web/API
origins to the exact staging origin, puts `manifest.json` at the archive root,
and binds the archive hash to the current Git SHA in release metadata. It
preserves non-KidItem permissions declared by the source manifest, including
the Coupang extension's local image bridge permission.

Verify the local artifact before publishing:

```bash
RELEASE_DIR="output/extensions/coupang-ads-scraper/1.2.66/staging"

(cd "$RELEASE_DIR" && shasum -a 256 -c \
  kiditem-coupang-ads-scraper-v1.2.66-staging.zip.sha256)

unzip -l "$RELEASE_DIR/kiditem-coupang-ads-scraper-v1.2.66-staging.zip"
```

## Create A Draft GitHub Release

Publishing defaults to a draft so the operator can inspect the tag, SHA,
origin, archive, checksum, and metadata before making it visible:

```bash
git switch main
git pull --ff-only origin main

STAGING_URL="$(gh variable get STAGING_URL --env staging)"

npm run extension:release -- publish \
  --extension coupang-ads-scraper \
  --target staging \
  --web-origin "$STAGING_URL" \
  --api-origin "$STAGING_URL"
```

The publisher refuses to run unless the worktree is clean and `HEAD` exactly
matches `origin/main`. It also refuses to replace an existing Release tag and
marks extension Releases as prerelease and non-latest so they do not replace
the repository's application-level Latest release.

Inspect and publish the draft:

```bash
TAG="extension-coupang-ads-scraper-v1.2.66-staging"

gh release view "$TAG"
gh release edit "$TAG" --draft=false --prerelease --latest=false
```

An operator may publish immediately only after the same inspection has already
been completed against a local package:

```bash
npm run extension:release -- publish \
  --extension coupang-ads-scraper \
  --target staging \
  --web-origin "$STAGING_URL" \
  --api-origin "$STAGING_URL" \
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
   existing extension card. Do not leave both old and new copies enabled.
6. Reload the KidItem page. Confirm the web handshake reports the expected
   extension version and required capabilities.
7. Complete marketplace login, OTP, and account selection in the operator's
   normal Chrome profile. Never package or copy those session values.

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
2. Open the staging KidItem page and confirm extension discovery succeeds.
3. Confirm the installed version matches release metadata.
4. Confirm required capabilities are reported by the extension `ping` reply.
5. Execute one safe read-only collection for the extension's primary surface.
6. Confirm no localhost KidItem web/API origin is requested by the staging
   package. The Coupang local image bridge remains a separate declared
   capability.

## Rollback

Download and load a previous immutable Release. A rollback is allowed only when
the current KidItem web capability/version gate still accepts that extension.
If it does not, fix forward with a higher extension version instead of lowering
the web requirement or overwriting a Release.

## Blockers

Stop and report when:

- `main` is dirty or differs from `origin/main`;
- the Release tag already exists;
- the package contains a localhost KidItem origin;
- the checksum or metadata Git SHA does not match;
- Chrome reports a manifest or permission error;
- the KidItem page reports the extension missing, outdated, or missing a
  required capability;
- marketplace login, OTP, or account authorization needs human action.

## Final Report Format

```text
Extension: <directory>
Manifest version: <version>
Target: staging
Git SHA: <40-hex>
Tag: <release tag>
Release: <draft|published>; URL=<url>
SHA256: <archive hash>
Automated gates: <commands and result>
Manual acceptance: <passed|blocked>
Blockers: <none or exact blocker>
```
