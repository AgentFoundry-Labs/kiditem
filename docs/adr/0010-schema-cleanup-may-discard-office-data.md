---
status: accepted
---

# Schema cleanup may discard Office data until preservation is declared

Office still carries legacy data shapes, and every schema cutover stalled on
backups, Office-copy rehearsals, and surveys of the live database. Until the
owner declares that Office data must be preserved, cutovers delete what no
longer fits the schema and keep one dump, because finishing the schema cleanup
is worth more than the discarded history.

## Considered options

- **Expand, backfill, contract, and rollback evidence for every destructive
  change.** Preserves history, but each drop waited on verified copies and
  confirmations about the live database, which stalled the cleanup.
- **Reset the whole database and recollect.** Fastest, but loses records that
  people made (users, channel accounts, confirmed recipes) and transport
  receipts, whose loss could apply the same transport effects twice.

## Consequences

Migrations carry forward users and organizations, channel accounts, confirmed
recipes, orders, and transport receipts; other rows that cannot fit are
deleted. The procedure lives in the
[data-loss policy](../runbooks/deployment-architecture.md#data-loss-policy).
Declaring preservation supersedes this ADR and restores the expand, backfill,
and contract path.
