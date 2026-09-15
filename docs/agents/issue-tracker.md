# Issue Tracker: Linear

Internal work and in-flight specs live in Linear, team `Kiditem`. GitHub holds
branches, PRs, checks, reviews, and merge evidence; GitHub Issues are reserved
for external intake or upstream work. Link external intake to its Linear work
item. Keep suspected vulnerabilities and secrets out of public issues.

## Projects And Milestones

- One Linear project is one release train, named after the root `VERSION`
  (for example `Office 0.1.31`). Only issues in the project ship in that
  version. Do not open the next train's project ahead of time; the user
  decides what leaves the train.
- A milestone is one feature the train updates. Name it with the feature
  only and put scope in its description. Do not assign milestone owners ahead
  of time: ownership follows the assignees and delegates of the issues inside
  it while the work happens.
- Every issue in the project carries a milestone, including new Triage
  issues.
- The first line of an issue's `## 현재 상태` section reads
  `마일스톤 <feature> · <human assignee> · <Dev Leader>`.

## Issue Relationships And Evidence

- Use the assignee for the accountable human, the delegate for the Dev Leader
  orchestrating the issue, and native priority for urgency. An issue an agent
  creates is assigned to the person running the session; set the delegate
  only when a Dev Leader claims it.
- `HITL` marks a decision or action only a person can take. The delegate
  session asks and batches its questions before its next PR. When another
  decision already settles a `HITL` item, record that source on the issue and
  remove the label instead of asking again.
- Link sub-issues to their parent spec or `wayfinder:map` issue, and record
  dependencies with blocks/blocked-by relations. Issue boundaries do not
  determine branch or PR boundaries.
- Record scope, decisions in the user's words, open questions, blockers,
  deferred work, and verification evidence on the issue as they happen. Link
  PRs rather than duplicating review threads. Read back updates to confirm
  shared state.
- Comments are an append-only record: decisions, facts, review results, merge
  commits. Never rewrite a past comment. The one live surface is the
  `## 현재 상태` section at the top of the description (see Orchestration).
- Mark work Done only with completion evidence; for merged implementation,
  record the PR and merge commit.
- Apply the root `CLAUDE.md` ADR eligibility check before recording a settled
  decision in `docs/adr/`. Settle the ADR's wording on the owning issue in a
  comment titled `ADR-000N 확정 문장` next to that check; the `docs/adr/` file
  lands in the PR that implements the decision, never in a docs-only PR. Link
  qualifying ADRs from the spec. Other decisions stay on the issue or in the
  relevant implementation documentation.

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

- Open an issue only for work worth tracking on its own: a defect an
  operator meets, a rule or contract change, a decision someone must make, or
  work another person will own. Create it in Triage when found during a task
  or reported from outside; `/to-spec` and `/to-tickets` publish to Ready.
  Findings that share one cause share one issue.
- Everything else found during a task goes into a `## 파생` checklist on the
  issue that found it (one `- [ ]` line each) and rides along in that issue's
  PR or in one cleanup issue per milestone; promote a line to an issue only
  when it meets the rule above.
- Keep an issue's record readable: one comment thread per topic (QA, review,
  decision) with replies under it instead of a flat list. Code-review
  findings live on the PR's Linear review as diff threads and are resolved
  there; the issue keeps one summary line.
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
  the PR URL and its Dev Leader as the description, and apply it to every
  issue that PR completes: one PR label per issue.

## Orchestration

Linear is the durable memory of an orchestrating session: another session must
be able to resume the work from Linear alone.

Each orchestrating session acts as one **Dev Leader** and drives one PR. A Dev
Leader is a Linear agent app user (`Dev Leader 1`, `Dev Leader 2`, …; list them
with `list_users`) that a workspace admin installs. Before claiming, take a
leader that no open issue delegates to.

1. **Frontier.** From Ready issues, keep those without `HITL`,
   `wayfinder:grilling`, or `wayfinder:prototype`, without open sub-issues, and
   whose blocked-by issues are all Done. Read each blocker's status: resolved
   blockers stay listed. The frontier is complete when every Ready issue is
   either on it or excluded by one of these rules.
2. **Claim.** Move the issue to In Progress, set its delegate to your leader
   while the human stays assignee, and record the branch, worktree, and agent
   in the live state. Release it by moving it back to Ready with the delegate
   cleared and a comment.
3. **Live state.** Keep a `## 현재 상태` section at the top of the description
   of the spec, map, or lead issue of the PR, and keep it to four lines:
   milestone · human assignee · Dev Leader; branch · worktree · PR; next step;
   last update (KST, trigger). State, PR links, and field changes live in
   Linear's own fields and activity, not in prose. History goes to one comment
   thread titled `진행`: one reply per trigger — claim, agent start, agent
   finish, review result, PR open, CI result, merge, user decision — and
   nothing in that thread is rewritten. Long-lived context that outlives one
   issue (a handover, a design brief) is a project document linked from the
   issue.
4. **Found work** goes to Triage with a relation to the issue that found it.
5. **PR.** Branch from the latest `develop` as `kid-<number>-<short-description>`
   with no tool or account prefix; every contributor pulls `develop` and
   branches for themselves, so never hand a branch to someone else. Do not
   rebase a topic branch: when `develop` moves, `git merge origin/develop`, so
   the commit SHAs recorded in Linear stay reachable. Size a PR as one unit
   that is reviewed and verified together (see the root `CLAUDE.md`); do not
   split one piece of work into step-by-step PRs. In the PR body write
   `Fixes KID-nnn` for every issue the merge completes and `Refs KID-nnn` for
   issues that still need verification after merge (QA, a workflow run). The
   Linear GitHub integration moves `Fixes` issues to In Review on open and Done
   on merge; do not move those by hand. When the PR opens, apply its `PR` label
   and update the live state; after merge, record the merge commit there and
   mark `Refs` issues Done only with their evidence.

## Tool Conventions

Use the connected Linear tools and their current schemas:

- Read the issue by identifier; include relations when dependencies matter.
- Create issues in team `Kiditem`; use `parentId` for sub-issues.
- Prefer patch updates and label additions/removals to replacing full content
  or label sets. Preserve unrelated fields.
