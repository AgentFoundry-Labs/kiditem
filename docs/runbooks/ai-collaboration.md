# KidItem AI Collaboration Runbook

This is the shared work contract for collaborators using Codex, Claude, Hermes,
or another development assistant. It does not require Hermes to observe or
start other sessions.

## System Of Record

- Linear owns every internal work item, the accountable human, priority,
  status, durable decisions, blockers, and handoffs.
- GitHub owns implementation evidence: branch, commits, PR, checks, review, and
  merge. GitHub Issues are not an internal task ledger.
- Slack owns live discussion, meetings, explicit Hermes requests, and exception
  alerts. It is not a second task ledger.

## Prerequisites

- Use the Kiditem Linear team and an authenticated GitHub account.
- Assign every issue to the human accountable for its outcome.
- Use `kiditem-dev` for development discussion and `kiditem-alerts` for
  exceptions. Never place access tokens or secrets in Linear, Slack, commits,
  or PRs.
- This contract requires no environment variables. Each tool uses its own
  authenticated connection.

## Intake

1. Create or select one Linear issue before changing the repository. Intake may
   start in Linear, Slack, Codex, Claude, or another tool; record the resulting
   scope and durable decisions in Linear.
2. `Ready` is the shared accepted-work queue, not a Hermes-only queue. Moving an
   issue into it remains a human prioritization decision.
3. Prefer Korean workflow labels while retaining technical terms and actual
   Agent names. Represent human accountability with the assignee, not generic
   labels such as `구현자:사람` or `리뷰어:사람`.
4. Reserve `Agent:<actual-profile-name>` for an autonomous profile explicitly
   dispatched by an orchestrator. Directly operated Codex or Claude sessions
   name their actual tool in comments and do not add an `Agent:*` route label.
5. Never create or ask another Agent to create a GitHub Issue for an internal
   bug, task, review follow-up, technical-debt item, cleanup, or discussion
   outcome. Create the Linear issue directly, even when intake starts in Slack,
   Codex, Claude, Hermes, a PR review, or another tool.

## GitHub Issue Exception

- Reserve GitHub Issues for externally authored intake when the reporter cannot
  use Linear, or for an issue that must live in another repository owned by an
  upstream project.
- For an external issue in this repository, create or link exactly one Linear
  issue for execution. Use GitHub only for communication with the reporter;
  keep status, priority, ownership, and internal decisions in Linear.
- If external discussion no longer needs to remain open, comment with the
  Linear identifier and close the GitHub Issue. Do not mirror routine Linear
  updates back to GitHub.
- Never put a suspected vulnerability or secret in a public GitHub Issue. Use a
  private security channel or GitHub Security Advisory and track remediation in
  a restricted Linear issue.

## Start Work

1. Read the live issue, its comments, and linked GitHub branch or PR before
   editing. Reconcile or stop duplicate work.
2. Move accepted work to `In Progress` and add one start comment containing the
   human owner, actual tool, branch, scope, and next checkpoint.
3. Keep one branch and PR per issue unless the issue explains why work is split.
4. Collaborators may choose their own tool, model, and reasoning strength unless
   the issue or an explicitly dispatched Agent profile pins them. Record the
   actual implementer and every required independent reviewer separately.

## Checkpoints

Update Linear only when shared state changes:

- PR opened: link the PR and verification evidence, then use `In Review`.
- Feedback fixed in the current PR stays in its GitHub review conversation;
  deferred or separately owned follow-up work becomes a Linear issue, never a
  new GitHub Issue.
- Rework requested: record the reason and return to `In Progress`.
- Human decision or authorization required: use `Human Input` and name the
  decision owner.
- External dependency prevents progress: use `Blocked` and name the unblock
  condition.
- Required reviews pass and checks are green: record `병합 준비`; an authorized
  human or Agent may perform the final merge.
- Work completes: read the live merge or equivalent evidence before marking
  `Done`.

Read Linear back after every mutation. A successful write command alone is not
proof that shared state changed.

## Merge And Cleanup

The merge executor may be an accountable human or an authenticated Agent or
orchestrator with repository write access. Human approval is required only when
branch protection, the Linear issue, an applicable risk policy, or an explicit
`Human Input` checkpoint requires it; do not impose a human-only merge gate by
default.

Immediately before merging, the executor must read the live PR and confirm:

- base, head, commit count, and diff scope match the Linear issue;
- required checks succeeded and no conflict or blocking conversation remains;
- every review required by branch protection, the issue, or risk policy passed;
- the issue is neither `Human Input` nor `Blocked` and all named approvals exist;
- the merge method matches root `AGENTS.md`.

The merge executor does not count as an independent reviewer for work it
implemented. If an independent review is required, a different human or Agent
must provide it before merge.

After merge, the executor owns closeout:

1. Read the live PR again and record its `MERGED` state and merge commit SHA.
2. Move Linear to `Done`, add the merge and verification evidence, and read the
   issue back.
3. Fetch and prune the remote, then fast-forward clean managed checkouts of the
   target branch. Never overwrite or stash another collaborator's changes merely
   to synchronize a checkout.
4. Delete the merged remote topic branch and its local branch only after merge
   evidence is confirmed. Remove only a clean, inactive task worktree after
   checking for modified, untracked, or unmerged files and other active users.
5. Preserve dirty or active checkouts and report why they were retained. Never
   delete or classify `release/office` as cleanup.

## Hermes

Hermes acts only after an explicit request such as `KID-123 진행해줘`,
`Ready에서 다음 작업 찾아줘`, or `KID-123 PR 리뷰해줘`. It may then select,
implement, review, or archive a decision within the requested scope.

Hermes never creates or mirrors an internal GitHub Issue. It may read an
externally authored or legacy GitHub Issue, link it to Linear, communicate with
the external reporter, and close it when the Linear handoff is complete.

Do not add Ready polling, watchers, webhook auto-start, or background inspection
of Codex or Claude sessions. Hermes must re-read live Linear and GitHub state
before every dispatch or review so it does not duplicate another collaborator.

## Slack

- Use `kiditem-dev` for meetings, issue discussion, explicit Hermes requests,
  and fast decisions. Summarize durable outcomes on the linked Linear issue.
- Use `kiditem-alerts` only for `Human Input`, `Blocked`, high-risk failures, and
  similar exceptions.
- Keep routine progress, review state, and PR checks in Linear and GitHub instead
  of mirroring every update into Slack.

## Blockers And Recovery

- If Linear cannot be read or written, pause repository edits unless the human
  explicitly authorizes offline work. Backfill the issue before opening a PR.
- If Linear, GitHub, and the local checkout disagree, reconcile live state
  before continuing or ask the accountable human to choose the authority.
- If a duplicate branch or PR exists, do not silently replace it; link both on
  the issue and agree which one continues.

## Final Report

Every implementation or review handoff reports:

- Linear issue and current status;
- accountable human and actual implementer/reviewer;
- branch and PR;
- verification evidence;
- merge executor and merge commit when completed;
- synchronization and branch/worktree cleanup results;
- blocker, required approval, or merge readiness.
