---
name: staging-deploy-operator
description: Use when deploying KidItem to staging, recovering failed staging deploys, checking staging GitHub Actions runs, explaining duplicate-looking CI jobs, rolling back staging, or syncing develop after a main staging hotfix.
---

# Staging Deploy Operator

Operate KidItem staging from GitHub Actions with evidence. Never declare staging healthy from a green build alone; confirm deploy run success, public smoke, migration status, deploy tag, and a final status query.

## When to Use

Use for:
- `staging-deploy.yml` deploy, status, rollback, or failed run triage.
- Disk-full / ENOSPC image pull recovery on EC2.
- Questions like "why did deploy run twice?" or "CI looks duplicated."
- Small staging hotfixes pushed to `main`, followed by `develop` sync.

Do not use for production deploys.

## Quick Reference

| Situation | First move | Do not |
|---|---|---|
| Failed deploy | Inspect failed job logs and run `operation=status` | Blindly `gh run rerun` |
| Destructive rebuild | Use `destructive_reset=RESET_STAGING_DATA` only for the reviewed account-preserving rebuild | Treat image-pull failures as reset cases |
| Disk full / ENOSPC | Default deploy retry stops the staging stack to free active image layers; verify status first if triaging a failure | Delete Docker volumes, DB data, or uploaded assets |
| Duplicate-looking CI | Compare run id, event, head SHA, job conclusions, skipped jobs | Assume skipped jobs ran |
| Main staging hotfix | Deploy `main`, then merge `origin/main` into `develop` | Leave develop behind |

## Deploy

From the repo root:

```bash
expected_git_sha="$(rtk git rev-parse origin/main)"
dispatch_correlation_id="$(rtk node -e 'console.log(require("node:crypto").randomUUID())')"
rtk gh workflow run staging-deploy.yml --ref "$expected_git_sha" \
  -f operation=deploy \
  -f deployment_target=staging \
  -f expected_git_sha="$expected_git_sha" \
  -f dispatch_correlation_id="$dispatch_correlation_id"
```

Watch the run and inspect failure logs if needed:

```bash
run_id="$(rtk gh run list --workflow staging-deploy.yml --limit 20 \
  --json databaseId,headSha,name \
  --jq '.[] | select(.headSha == "'"$expected_git_sha"'" and (.name | contains("correlation='"$dispatch_correlation_id"'"))) | .databaseId' \
  | rtk head -n 1)"
rtk node -e 'if (!process.argv[1]) process.exit(1)' "$run_id"
rtk gh run watch "$run_id" --exit-status --interval 30
rtk gh run view "$run_id" --log-failed
```

Success requires all of these:
- `Deploy to staging` completed with conclusion `success`.
- `Verify public staging URL` passed.
- `Verify staging data migration status` passed.
- `Tag successful staging deploy` created or confirmed a `staging-v<VERSION>-<YYYYMMDD>-<shortsha>` tag.
- The final `Query final EC2 status` step shows the expected `gitSha`, healthy
  API/web/nginx containers, `/login -> 200`, and `/api/auth/me -> 401`.

## Failure Triage

1. Identify the failed step from `gh run view <run-id> --json jobs,url` and `--log-failed`.
2. Classify it before retrying:
   - Build failure: fix image/app code; do not rerun deploy-only.
   - Migration or Prisma failure: inspect the immutable SHA, DB identity, account preflight, and ledger-baseline evidence; do not weaken a guard.
   - `no space left on device`, `ENOSPC`, or "Refusing to stop": disk/image-pull recovery.
   - Public smoke failure: inspect remote status and app logs before another deploy.
   - Tag failure: verify tag target and existing tag object.
3. Run status before a risky retry:

```bash
expected_git_sha="$(rtk git rev-parse origin/main)"
dispatch_correlation_id="$(rtk node -e 'console.log(require("node:crypto").randomUUID())')"
rtk gh workflow run staging-deploy.yml --ref "$expected_git_sha" \
  -f operation=status -f deployment_target=staging \
  -f expected_git_sha="$expected_git_sha" \
  -f dispatch_correlation_id="$dispatch_correlation_id"
rtk gh run watch <status-run-id> --exit-status --interval 10
rtk gh run view <status-run-id> --log
```

## Disk-Full Recovery

Default deploy behavior may stop the running staging stack only after an image
pull hits `no space left on device` or `ENOSPC`, then prune unused Docker
resources and retry the pull. It must not delete Docker volumes, the database,
or uploaded assets.

If an older workflow run refused to stop after image pull ran out of disk, do
this:

1. Confirm this is staging and the failure is image-pull disk pressure, not DB/data loss.
2. Check current status so the user knows whether the old stack is still serving.
3. Dispatch a new deploy. The workflow default is
   `allow_downtime_for_space=true`; pass it explicitly when replaying old
   commands.

```bash
expected_git_sha="$(rtk git rev-parse origin/main)"
dispatch_correlation_id="$(rtk node -e 'console.log(require("node:crypto").randomUUID())')"
rtk gh workflow run staging-deploy.yml --ref "$expected_git_sha" \
  -f operation=deploy \
  -f deployment_target=staging \
  -f expected_git_sha="$expected_git_sha" \
  -f dispatch_correlation_id="$dispatch_correlation_id" \
  -f allow_downtime_for_space=true
```

This may stop the current staging stack to free active Docker layers. It must not delete Docker volumes, the database, or uploaded assets.

## CI Duplication Check

GitHub displays every job in a workflow, including skipped jobs. Before saying deploy ran twice, collect:

```bash
rtk gh run view <run-id> --json databaseId,event,headSha,status,conclusion,jobs,url
rtk gh run view <run-id> --job <job-id> --log
```

Evidence rules:
- A job with conclusion `skipped` and no steps did not run.
- `operation=status` should only run `Show staging status`; build/deploy/rollback jobs appearing as skipped is normal.
- `operation=deploy` should run prepare, build API, build web, and deploy once for one run id.
- For `operation=deploy`, only the `Deploy to staging` job should declare the
  `staging` environment. Build/preparation jobs must not use that environment,
  otherwise GitHub creates extra deployment records for one deploy.
- Compare `headSha` and manifest `github.runId` before claiming a second deploy changed staging.
- Current smoke evidence is `/api/auth/me -> 401`; do not broaden it to `403` unless the workflow expectation changes.

## Rollback

Rollback uses immutable GHCR tags, not `staging`:

```bash
workflow_code_sha="$(rtk git rev-parse origin/main)"
dispatch_correlation_id="$(rtk node -e 'console.log(require("node:crypto").randomUUID())')"
rtk gh workflow run staging-deploy.yml --ref "$workflow_code_sha" \
  -f operation=rollback \
  -f deployment_target=staging \
  -f expected_git_sha="$workflow_code_sha" \
  -f dispatch_correlation_id="$dispatch_correlation_id" \
  -f image_tag=<git-sha-tag>
```

`workflow_code_sha` selects the guarded workflow implementation; `image_tag`
is the separate immutable application revision being restored. Select the run
once by exact `headSha` plus `correlation=<UUID>` in `run-name`, then reuse that
numeric run ID for watch/log/status evidence.

After rollback, run `operation=status` and confirm manifest, containers, and smoke endpoints.

## Sync Develop After Main Hotfix

When a staging hotfix lands directly on `main`, sync `develop` by ancestry, not by patch equivalence alone:

```bash
rtk git status --short --branch
rtk git fetch origin --prune --unshallow || rtk git fetch origin --prune
rtk git log --oneline --decorate --left-right --cherry-pick origin/develop...origin/main
rtk git switch develop
rtk git pull --ff-only origin develop
rtk git merge --no-edit origin/main
# resolve conflicts, then verify and push
rtk git diff --check
rtk git push origin develop
```

Final sync evidence:

```bash
rtk git fetch origin --prune
rtk git merge-base --is-ancestor origin/main origin/develop
rtk git diff --stat origin/main..origin/develop
rtk git rev-list --count origin/develop..origin/main
```

`origin/develop..origin/main` must be `0`. A nonzero `origin/main..origin/develop` can be normal because `develop` may contain the merge commit.

## Common Mistakes

| Mistake | Correction |
|---|---|
| Rerunning a failed deploy | Dispatch a new run when inputs must change. |
| Calling skipped jobs duplicate deploys | Inspect job conclusions and logs first. |
| Using `destructive_reset` for disk failures | Leave it empty; disk pressure is not a database rebuild. |
| Waiting for build success only | Confirm deploy, smoke, migration status, tag, and final status. |
| Accepting a different auth smoke code by intuition | Use the workflow's current expectation: `/api/auth/me -> 401`. |
| Treating cherry-pick equivalence as sync | Merge `origin/main` into `develop` so ancestry is explicit. |
