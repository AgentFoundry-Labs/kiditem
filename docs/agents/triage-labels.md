# Triage roles and the Linear label design

## The five triage roles are statuses, not labels

Linear's workflow already expresses them. `/triage` moves an issue's status; it
does not create a parallel label vocabulary.

| Role in mattpocock/skills | In our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | status **Triage** | Maintainer needs to evaluate this issue |
| `needs-info` | status **Human Input** | Waiting on a human for more information |
| `ready-for-agent` | status **Ready** + label `Agent:kiditem-implementer` | Fully specified, ready for an AFK agent |
| `ready-for-human` | status **Ready**, no `Agent:*` label | Requires human implementation |
| `wontfix` | status **Canceled** | Will not be actioned |

Set a status with `save_issue`'s `state`. Add an agent label with `addLabels`,
never `labels` — the latter replaces the whole set.

**Do not create these five as labels.** `wontfix` as a label would leave the
issue open, which is worse than `Canceled`. The other four are the statuses
themselves.

### Two things to know before moving a status

- **`Human Input` is a `started` status.** Moving a Backlog issue there marks it
  as in-progress work on the board. That is the team's own design; follow it,
  but don't do it by accident to an issue nobody has picked up.
- **`ready-for-human` has no label on purpose.** `구현자:사람` and `리뷰어:사람`
  were retired on 2026-08-06 in favour of labelling only agent work. Human
  ownership is the absence of an `Agent:*` label plus the assignee. Query it as
  "Ready AND label is not `Agent:*`". Do not reintroduce a human-role label.

## The label axes

One axis per group. Nothing here duplicates a native Linear field.

| Axis | Labels | Answers |
| --- | --- | --- |
| Kind | `Bug`, `Feature`, `Improvement` | what kind of change |
| Work type | `유형:구현`, `유형:논의` | does this need a code PR, or does it conclude in the issue |
| Area | `Backend`, `Frontend`, `Extension`, `Schema·Data`, `Release·Infra` | where the work lives |
| Risk | `고위험`, `Security` | needs extra care |
| Routing | `Agent:kiditem-implementer`, `Agent:kiditem-reviewer` | which agent executes |
| Provenance | `이관됨` | migrated from another tracker |

Priority is the **native `priority` field** (0–4), not a label. Workflow
position is the **status**, not a label.

## Retired 2026-09-10, and why

Each duplicated a native field or a status. Retiring keeps them visible on
issues that already carry them; they just can't be applied to new ones.

| Retired | Superseded by | Was used on |
| --- | --- | --- |
| `우선순위:높음` | native `priority` | 2 issues, both already `High` natively |
| `우선순위:보통` | native `priority` | 0 issues |
| `병합 준비` | status **In Review** | 0 issues |
| `선행 작업 필요` | status **Blocked** | 1 issue (Canceled) |
| `재작업` | a status move plus a comment | 0 issues |

Unused labels that carry a capability with no equivalent — `Bug`, `Security` —
were **kept**. The cut was duplicates, not capability.
