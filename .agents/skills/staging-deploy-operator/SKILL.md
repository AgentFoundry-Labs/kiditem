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
| Data-loss prompt | Use `accept_data_loss=true` only for reviewed staging schema cleanup | Treat image-pull failures as data-loss cases |
| Disk full / ENOSPC | Keep current stack up unless staging downtime is explicitly approved | Stop the stack silently |
| Duplicate-looking CI | Compare run id, event, head SHA, job conclusions, skipped jobs | Assume skipped jobs ran |
| Main staging hotfix | Deploy `main`, then merge `origin/main` into `develop` | Leave develop behind |

## Deploy

From the repo root:

```bash
rtk gh workflow run staging-deploy.yml --ref main \
  -f operation=deploy \
  -f accept_data_loss=false \
  -f allow_downtime_for_space=false
```

Watch the run and inspect failure logs if needed:

```bash
rtk gh run list --workflow staging-deploy.yml --branch main --limit 5 \
  --json databaseId,status,conclusion,event,headSha,url
rtk gh run watch <run-id> --exit-status --interval 30
rtk gh run view <run-id> --log-failed
```

Success requires all of these:
- `Deploy to staging` completed with conclusion `success`.
- `Verify public staging URL` passed.
- `Verify staging data migration status` passed.
- `Tag successful staging deploy` created or confirmed a `staging-v<VERSION>-<YYYYMMDD>-<shortsha>` tag.
- A follow-up `operation=status` shows the expected `gitSha`, healthy API/web/nginx containers, `/login -> 200`, and `/api/auth/me -> 401`.

## Failure Triage

1. Identify the failed step from `gh run view <run-id> --json jobs,url` and `--log-failed`.
2. Classify it before retrying:
   - Build failure: fix image/app code; do not rerun deploy-only.
   - Migration or Prisma failure: inspect data-loss/preflight output; only use `accept_data_loss=true` after reviewed staging cleanup.
   - `no space left on device`, `ENOSPC`, or "Refusing to stop": disk/image-pull recovery.
   - Public smoke failure: inspect remote status and app logs before another deploy.
   - Tag failure: verify tag target and existing tag object.
3. Run status before a risky retry:

```bash
rtk gh workflow run staging-deploy.yml --ref main -f operation=status
rtk gh run watch <status-run-id> --exit-status --interval 10
rtk gh run view <status-run-id> --log
```

## Disk-Full Recovery

Default behavior preserves the running stack. If the failed log says the remote script refused to stop after image pull ran out of disk, do this:

1. Confirm this is staging and the failure is image-pull disk pressure, not DB/data loss.
2. Check current status so the user knows whether the old stack is still serving.
3. Use `allow_downtime_for_space=true` only when the user explicitly approves staging downtime, or when status proves the stack is already down/unhealthy.

```bash
rtk gh workflow run staging-deploy.yml --ref main \
  -f operation=deploy \
  -f accept_data_loss=false \
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
- Compare `headSha` and manifest `github.runId` before claiming a second deploy changed staging.
- Current smoke evidence is `/api/auth/me -> 401`; do not broaden it to `403` unless the workflow expectation changes.

## Rollback

Rollback uses immutable GHCR tags, not `staging`:

```bash
rtk gh workflow run staging-deploy.yml --ref main \
  -f operation=rollback \
  -f image_tag=<git-sha-tag>
```

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
| Setting `accept_data_loss=true` for disk failures | Keep it `false`; disk pressure is not a schema cleanup. |
| Waiting for build success only | Confirm deploy, smoke, migration status, tag, and final status. |
| Accepting a different auth smoke code by intuition | Use the workflow's current expectation: `/api/auth/me -> 401`. |
| Treating cherry-pick equivalence as sync | Merge `origin/main` into `develop` so ancestry is explicit. |
