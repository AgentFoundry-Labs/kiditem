# Issue tracker: Linear

Issues and specs for this repo live in **Linear** (team `Kiditem`). Use the Linear
MCP tools; there is no CLI convention here.

This is not the skill suite's default. It follows
[docs/runbooks/ai-collaboration.md](../runbooks/ai-collaboration.md), which is
the binding work contract for this repo:

> Linear owns every internal work item, the accountable human, priority, status,
> durable decisions, blockers, and handoffs.
> GitHub owns implementation evidence: branch, commits, PR, checks, review, and
> merge. **GitHub Issues are not an internal task ledger.**

Every open GitHub issue was migrated to Linear and closed with the `이관됨`
label. Do not create GitHub issues.

## Conventions

- **Create an issue**: `save_issue` with `team: "Kiditem"` and a `title`. Omit
  `id`. Assign the human accountable for the outcome — the runbook requires an
  assignee on every issue.
- **Update an issue**: `save_issue` with `id` (e.g. `KID-33`). Prefer `patch`
  over resending `description`, and `addLabels`/`removeLabels` over `labels`.
- **Read an issue**: `get_issue` with the identifier. Add
  `includeRelations: true` when blockers matter.
- **List issues**: `list_issues` with `team`, plus `state`, `label`, `assignee`
  or `query` as needed.
- **Comment**: `save_comment` on the issue.
- **Sub-issues**: `save_issue` with `parentId` set to the parent identifier.
- **Blocking**: `save_issue` with `blockedBy` / `blocks` (append-only).

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `Kiditem`.

## When a skill says "fetch the relevant ticket"

`get_issue` with the identifier.

## Pull requests as a request surface

**No.** GitHub PRs carry implementation evidence, not requests. A PR links back
to its Linear issue as an attachment; the issue, not the PR, is the ledger.

## Boundary with `docs/superpowers/`

Linear holds *work items* — status, ownership, blockers.
`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the *durable design
and execution record*, and the root `CLAUDE.md` requires they stay in the repo.
A Linear issue should link to its spec rather than restate it.
