# Issue Tracker: Linear

Internal work and in-flight specs live in Linear, team `Kiditem`. GitHub holds
branches, PRs, checks, reviews, and merge evidence; GitHub Issues are reserved
for external intake or upstream work. Link external intake to its Linear work
item. Keep suspected vulnerabilities and secrets out of public issues.

## Issue Relationships And Evidence

- Use the assignee for the accountable human and native priority for urgency.
- Link sub-issues to their parent spec and record dependencies with issue
  relations. Issue boundaries do not determine branch or PR boundaries.
- Record scope, unresolved decisions, blockers, and deferred work on the issue;
  link PRs and verification evidence rather than duplicating review threads.
- Mark work Done only with completion evidence; for merged implementation,
  record the PR and merge commit. Read back updates to confirm shared state.
- Apply the root `CLAUDE.md` ADR eligibility check before recording a settled
  decision in `docs/adr/`; link qualifying ADRs from the spec. Other decisions
  stay on the issue or in the relevant implementation documentation.

## Status And Labels

| Meaning | Status |
| --- | --- |
| Awaiting evaluation (`needs-triage`) | Triage |
| Accepted, not started: waiting on a start condition, a blocker, or its turn | Backlog |
| Accepted and picked up next (`ready-for-agent`, `ready-for-human`) | Ready |
| Implementation underway | In Progress |
| Waiting for review | In Review |
| Waiting for a human decision or information (`needs-info`) | Human Input |
| Started work waiting for a dependency | Blocked |
| Not proceeding (`wontfix`) | Canceled |
| Completed with evidence | Done |

`Human Input` is a started status; use it for work actually awaiting a human.
`Blocked` is also a started status. Create accepted tickets in Backlog, record a
not-started issue's blockers as blocked-by relations, and move an issue to Ready
when it is picked up next.
Use existing kind, area, and risk labels where useful. Status and priority use
native fields rather than duplicate labels. `Agent:*` labels identify explicitly
dispatched autonomous profiles; a direct Codex or Claude session does not need
one. Human accountability remains the assignee.

## Tool Conventions

Use the connected Linear tools and their current schemas:

- Read the issue by identifier; include relations when dependencies matter.
- Create issues in team `Kiditem`; use `parentId` for sub-issues.
- Prefer patch updates and label additions/removals to replacing full content
  or label sets. Preserve unrelated fields.
