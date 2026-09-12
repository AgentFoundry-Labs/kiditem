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
4. **The Linear spec issue** for the area (`/to-spec` output, label
   `Agent:kiditem-implementer`, status Ready or In Progress) — the current
   design authority while implementation is moving. `docs/superpowers/specs/`
   is a frozen archive; see below.

If a file doesn't exist, **proceed silently**. Don't flag its absence and don't
propose creating it upfront. `/domain-modeling` creates `CONTEXT.md` and ADRs
lazily, when a term or decision actually needs resolving.

## Division of labour — keep these from drifting into each other

| Document | Holds | Does not hold |
| --- | --- | --- |
| `CLAUDE.md` chain | durable rules and invariants | vocabulary, rationale, history |
| `CONTEXT.md` | the domain glossary for one context | rules, gates, ownership |
| `docs/adr/` | decisions and why they were made | current rules (those live in `CLAUDE.md`) |
| Linear spec issue | active design still under implementation | anything settled and durable |
| `docs/superpowers/` | frozen archive of pre-2026-09-12 plans and specs | anything new |

The root `CLAUDE.md` already says instruction files carry durable invariants
only, and that rationale and history belong in source or durable docs. That is
the same split.

## `docs/superpowers/` is deprecated (2026-09-12)

In-flight design now lives in the issue tracker, following the
mattpocock-engineering skill flow: `/grill-with-docs` settles the decisions,
`/to-spec` publishes the spec as a Linear issue, `/to-tickets` splits it, and
`/implement` works a ticket. Durable decisions still go to `docs/adr/`.

- Write a **new** durable decision as an ADR, not as a spec section.
- A spec issue holds design that is still moving. When a decision inside it
  **settles**, record it as an ADR and leave the issue pointing at it.
- Never duplicate: a decision belongs in exactly one of the two, and the ADR
  wins on conflict.
- `docs/superpowers/plans/` and `docs/superpowers/specs/` are a frozen archive.
  Do not add files, do not edit existing ones to reflect later decisions, and
  do not treat any of them as a contract for a current change. Extract an
  archived spec's settled decisions into an ADR only when you next work in
  that area, and only where a future reader will ask "why is it like this".

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

The same applies to the area's Linear spec issue.
