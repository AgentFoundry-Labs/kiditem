---
status: accepted
---

# Orders owns direct transport consumption receipts

A completed Coupang directship capture is immutable source evidence. Converting
SHIPMENT or MILKRUN can happen later or be retried from another collection
attempt. Recording those effects inside the completed source's JSON made the
source mutable and made deduplication depend on which attempt a caller used.

Orders therefore owns an immutable transport receipt for each organization,
channel account, transport, and normalized effect payload. Normalization includes
the selected transport's purchase orders and the center data they use; unrelated
centers cannot create a new effect. An attempt consumption links one source
attempt and transport to that receipt. Repeating the same effect returns its
original source identity, line references, and transmission intent. A change to
the consumed evidence is a different effect, and conflicting same-attempt replay
is rejected.

Order and line changes, the Supply-owned workbook reconciliation invoked through
its owner boundary, receipt creation, and attempt consumption commit in the same
organization-locked transaction. Empty transport probes keep their receipt but
carry no transmission intent. Neither conversion nor receipt replay changes
physical inventory or submits a file to a provider.

## Consequences

- New effects use dedicated Orders tables instead of dual-writing completed
  source JSON. Keeping JSON as the authority would retain mutable evidence and
  require scanning old attempts to discover an existing effect.
- The additive migration preserves the original checksum in immutable legacy
  JSON and keeps the original effect identity. The new indexed receipt uses a
  normalized checksum computed from the retained source artifact and selected
  transport, so later attempts can find the same effect. It verifies source
  type, account, artifact and any linked workbook transmission tuple before
  accepting lineage; missing or ambiguous evidence stops migration.
- Deployment stops writers, applies the additive schema, runs the registered
  migration, and starts the new writer only after success. Before the first new
  consumption, the previous runtime remains compatible. Afterwards it cannot
  recognize new receipts: recovery requires a forward fix rather than a
  runtime-only rollback that could duplicate effects.

The implementation and migration evidence belong to
[KID-68](https://linear.app/kiditem/issue/KID-68).
