# Issue Tracker: Linear

Internal work and in-flight specs live in Linear, team `Kiditem`. GitHub holds
branches, PRs, checks, reviews, and merge evidence; GitHub Issues are reserved
for external intake or upstream work. Link external intake to its Linear work
item. Keep suspected vulnerabilities and secrets out of public issues.

## Issue Relationships And Evidence

- Use the assignee for the accountable human and native priority for urgency.
- Link sub-issues to their parent spec or `wayfinder:map` issue, and record
  dependencies with blocks/blocked-by relations. Issue boundaries do not
  determine branch or PR boundaries.
- Record scope, decisions in the user's words, open questions, blockers,
  deferred work, and verification evidence on the issue as they happen. Link
  PRs rather than duplicating review threads. Read back updates to confirm
  shared state.
- Mark work Done only with completion evidence; for merged implementation,
  record the PR and merge commit.
- Apply the root `CLAUDE.md` ADR eligibility check before recording a settled
  decision in `docs/adr/`; link qualifying ADRs from the spec. Other decisions
  stay on the issue or in the relevant implementation documentation.

## Status And Labels

Statuses carry an issue's lifecycle; labels carry only what a status cannot.
The skills' triage roles map onto both:

| Role | Linear |
| --- | --- |
| `needs-triage` | Triage |
| `needs-info` | Human Input |
| `ready-for-agent` | Ready without `HITL` |
| `ready-for-human` | Ready with `HITL` |
| `wontfix` | Canceled |
| `bug` | `Bug` |
| `enhancement` | `Feature` or `Improvement` |

In Progress means claimed; In Review means a PR or verification is pending;
Blocked means started work waiting on a dependency; Duplicate and Done close
the issue. Backlog and Todo stay empty.

- Create work found during a task or reported from outside in Triage, and
  issues published by `/to-spec` or `/to-tickets` in Ready.
- Triage each issue to Ready, Human Input, Canceled, or Duplicate, with exactly
  one of `Bug`, `Feature`, or `Improvement`.
- An accepted issue that waits on another stays in Ready with a blocked-by
  relation.
- The remaining labels are `HITL`; the areas `Backend`, `Frontend`,
  `Extension`, `Schema/Data`, `Release/Infra`, and `Security`; `High Risk`; the
  wayfinder skill's `wayfinder:map`, `wayfinder:research`,
  `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task` under
  those exact names; and the `PR` group. Each label's description is its rule;
  read them with `list_issue_labels`.
- When a PR opens, create its `PR` child label `#<number> <short title>` with
  the PR URL as the description, and apply it to every issue that PR
  completes: one PR label per issue.

## Orchestration

Linear is the durable memory of an orchestrating session: another session must
be able to resume the work from Linear alone.

1. **Frontier.** From Ready issues, keep those without `HITL`,
   `wayfinder:grilling`, or `wayfinder:prototype`, without open sub-issues, and
   whose blocked-by issues are all Done. Read each blocker's status: resolved
   blockers stay listed. The frontier is complete when every Ready issue is
   either on it or excluded by one of these rules.
2. **Claim.** Move the issue to In Progress and comment the branch, worktree,
   and agent. Release it by moving it back to Ready with a comment.
3. **Checkpoint.** Keep one current-state comment on the spec or map issue
   (done; running, with agent and worktree; next) and update it at each
   checkpoint.
4. **Found work** goes to Triage with a relation to the issue that found it.
5. **PR.** When the PR opens, apply its `PR` label and move its issues to In
   Review; after merge, mark them Done with the PR and merge commit.

## Tool Conventions

Use the connected Linear tools and their current schemas:

- Read the issue by identifier; include relations when dependencies matter.
- Create issues in team `Kiditem`; use `parentId` for sub-issues.
- Prefer patch updates and label additions/removals to replacing full content
  or label sets. Preserve unrelated fields.
