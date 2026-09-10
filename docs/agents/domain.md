# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase. This repo is **multi-context**: `CONTEXT-MAP.md` at the
root points at one `CONTEXT.md` per context.

## Read these before exploring

1. **`CLAUDE.md`, root to target.** This is the binding authority for rules and
   invariants — ownership, contracts, verification gates. The nearest guide adds
   to or overrides its parents. Nothing below overrides it.
2. **`CONTEXT-MAP.md`** at the root, then the `CONTEXT.md` for each context your
   topic touches.
3. **`docs/adr/`** for system-wide decisions, and `<context>/docs/adr/` for
   context-scoped ones. Read the ones that touch the area you are about to work
   in.
4. **`docs/superpowers/specs/`** — an ACTIVE spec is the current design
   authority for its area and can supersede an older ADR. Check its status
   header before trusting it. These are **transitional**; see below.

If a file doesn't exist, **proceed silently**. Don't flag its absence and don't
propose creating it upfront. `/domain-modeling` creates `CONTEXT.md` and ADRs
lazily, when a term or decision actually needs resolving.

## Division of labour — keep these from drifting into each other

| Document | Holds | Does not hold |
| --- | --- | --- |
| `CLAUDE.md` chain | durable rules and invariants | vocabulary, rationale, history |
| `CONTEXT.md` | the domain glossary for one context | rules, gates, ownership |
| `docs/adr/` | decisions and why they were made | current rules (those live in `CLAUDE.md`) |
| `docs/superpowers/specs/` | active design still under implementation | anything settled and durable |

The root `CLAUDE.md` already says instruction files carry durable invariants
only, and that rationale and history belong in source or durable docs. That is
the same split.

## `docs/superpowers/specs/` is being replaced by ADRs

The intended end state is that **every durable decision lives in `docs/adr/`**
and `docs/superpowers/specs/` holds nothing permanent. Until then both exist,
and the rule is directional:

- When a decision inside an ACTIVE spec **settles**, record it as an ADR and
  leave the spec pointing at it. Do not let a settled decision stay only in a
  spec.
- Write a **new** durable decision as an ADR, not as a new spec section.
- Keep using specs for design that is still moving — an ADR records a decision,
  not a work-in-progress.
- Never duplicate: a decision belongs in exactly one of the two, and while both
  exist the ADR wins on conflict.

Plans under `docs/superpowers/plans/` are execution records, not decisions, and
are outside this migration.

## Contexts

Each workspace with its own `CLAUDE.md` is a context. See `CONTEXT-MAP.md`.

## Use the glossary's vocabulary

When your output names a domain concept — an issue title, a refactor proposal, a
hypothesis, a test name — use the term as its `CONTEXT.md` defines it. Don't
drift to synonyms the glossary avoids. This repo already fixes several: prefer
`Organization`/`organizationId` over tenant; `LegalEntity` is tax/settlement
identity while `ChannelAccount` is marketplace identity.

If the concept isn't in the glossary yet, that's a signal: either you're
inventing language the project doesn't use (reconsider), or there's a real gap
(note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it rather than silently
overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

The same applies to an ACTIVE spec in `docs/superpowers/specs/`.
