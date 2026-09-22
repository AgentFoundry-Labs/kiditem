---
status: accepted
---

# Cross-owner references are ids, not foreign keys

Forty-eight Prisma relations cross an owner boundary (`ai` → `sourcing`,
`orders` → `channels`, `advertising` → `channels`, …), most with
`onDelete: Restrict`, so the database decides whether one domain may delete
its own row and Prisma `include` lets a consumer read another owner's ledger
without its reader. From now on a reference to another owner's row is a plain
id column with an index and no `@relation`: the writer checks the id through
the owner's interface, the reader treats a missing row as "none"
([ADR-0006](0006-a-displayed-number-is-a-measurement-or-nothing.md)), and the
owner deletes without asking. Organization and user scope, relations inside
one owner, and `SourceImportRun` (the shared collection-attempt identity)
keep their foreign keys, because those are coordinates, not coupling.

## Considered options

- **Keep foreign keys everywhere.** The database guards integrity, but every
  cutover that removes an owner's rows is blocked by another owner's
  `Restrict`, and `include` across owners keeps bypassing the one-reader rule
  ([ADR-0009](0009-one-ledger-one-reader.md)).
- **Cross-owner foreign keys with `SetNull`.** Deletion works, but the schema
  still names another owner's table and Prisma still offers the join.

## Consequences

`scripts/check-cross-owner-fk.mjs` reads a model-to-owner map (models in
`core.prisma` such as `ChannelAccount`, `ChannelListing` and `MasterProduct`
belong to Channels and Products) and an allowlist of the existing 48
relations; a new cross-owner `@relation` fails `check:conventions`. A PR that
touches one of those boundaries removes the `@relation`, keeps the column and
index, and deletes the allowlist entry. Cross-owner reads go through the
owner's reader or a raw query, never `include`.

[ADR-0016](0016-inventory-history-retains-deleted-sku-identities.md) defines
the scoped exception for retained Inventory transfer history: its SKU ID may
outlive the current SKU while organization and warehouse foreign keys remain.

[ADR-0021](0021-owner-capabilities-replace-dedicated-readers.md) supersedes the
dedicated-reader requirements and, for Channels-related references, automatic
platform FK exceptions. Evidence, organization, and transaction guarantees remain.
