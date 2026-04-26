---
id: 0021
title: Generated schema navigation graphs
status: Accepted
date: 2026-04-26
supersedes: [0012]
superseded-by: null
affects:
  - prisma
  - apps/server
  - packages/shared
---

## Context

ADR-0012 moved the Prisma schema to multi-file `prisma/models/*.prisma` files and made inline
`/// @namespace` / `/// @describe` comments the source of truth for schema domain meaning. That
part remains correct.

ADR-0012 also removed manually maintained ERD and Graphify outputs because the old artifacts were
treated like a parallel source of truth, drifted from schema, and required manual rebuild discipline.
Recent product import and sidebar rewire planning showed a narrower need: agents need a committed,
generated navigation aid for high-coupling schema/consumer questions before making cross-layer
changes. Without that generated context, future sessions either rely on stale untracked local files
or redo broad grep-based discovery.

## Decision

Reintroduce ERD and Graphify as **generated navigation artifacts**, not as schema truth.

- Prisma schema files under `prisma/models/*.prisma` remain the source of truth for tables, fields,
  relations, and domain namespace comments.
- PostgreSQL-only constraints in `prisma/3layer-setup.sql` remain part of DB truth.
- `docs/ERD.md` is a generated readable schema view.
- `graphify-out/schema/` is a generated graph of Prisma models, schema docs, and ADR references.
- `graphify-out/schema-consumers/` is a generated graph of the schema graph plus curated direct
  consumers currently relevant to schema/import rewires.
- Graphify `INFERRED` or `AMBIGUOUS` edges are review/navigation hints only. Important claims must
  be verified against source files before editing.

This ADR supersedes only ADR-0012's operational decision to remove generated ERD/Graphify artifacts.
It preserves ADR-0012's multi-file Prisma schema, inline namespace comments, and schema-as-source
model.

## Consequences

**Positive**

- Schema/import and sidebar rewire planning can start from committed graph context instead of
  untracked workspace state.
- High-coupling nodes such as `MasterProduct`, `ProductOption`, `Order`, inventory, and channel
  listing options are easier to inspect before a scoped implementation.
- Generated artifacts make PR review easier because schema-consumer assumptions are visible.

**Negative / tradeoffs**

- Graph outputs are larger than hand-written docs and can add noisy diffs when regenerated.
- The graph generator depends on the external `graphifyy` Python package at execution time.
- Inferred consumer edges can over-match common field names, so reviewers must not treat them as
  authoritative.

**Operational constraints**

- After Prisma model, ERD generator, schema-consumer, or import-script changes, run:
  - `npm run db:erd`
  - `npm run graphify:schema`
- Commit only intentional generated graph outputs and their README/report files.
- Do not ingest `graphify-out/` back into Graphify source input.

## Related

- ADR-0012 — Prisma multi-file schema with namespace annotations
- `docs/GRAPHIFY.md` — current graph usage and commit policy
- `scripts/generate-prisma-erd.mjs`
- `scripts/generate-schema-graphify.py`
