---
status: superseded by ADR-0009
---

# ABC display status is derived by Products, not by each reader

> **Superseded by [ADR-0009](0009-one-ledger-one-reader.md).** Products retains
> ownership of ABC publication and its evidence. Display words are derived from
> facts through shared functions, as established by ADR-0006 and ADR-0009; the
> historical instruction below to publish a status for consumers is not the
> current contract. Retained for decision history.

`productAbcDisplayStatus` is a pure function in the Products domain that turns
evidence readiness into one of `READY`, `NEW`, `SOURCE_UNMAPPED`,
`SELLPIA_SOURCE_STALE`, `AD_SOURCE_STALE` or `INSUFFICIENT_EVIDENCE`. The result
is **not stored anywhere** — no Prisma column holds it — so every reader derives
it, and each reader supplies its own evidence cutoff.

Four callers do this today. Three pass yesterday KST; the dashboard's inventory
adapter passes the **previous month end**. Because `sourceReadiness` compares
`coverageEndDate >= targetCutoff`, the dashboard is asking a materially easier
question than everything else. The same product, at the same instant, can read
`READY` on the dashboard and `SELLPIA_SOURCE_STALE` in Product Hub.

**Products owns the derivation and publishes it. Consumers read the published
status instead of recomputing it.** This is what the root guide already requires
— each domain owner is the canonical authority for its state — and what the
dashboard guide already claims it does: read Products' stored grade and current
evaluation snapshot.

## Considered options

**Align the dashboard's cutoff to yesterday KST.** One line, immediately
consistent. Rejected as the destination: it leaves four independent derivations
that can drift apart again the next time someone adds a reader, and it is a
behaviour change to code that is deleted by the option below anyway. Doing both
means changing the dashboard twice.

**Keep the cutoffs different and document why.** Rejected: the claim that the
difference is deliberate rests on one comment in a test file, and nothing
surfaces it to the user. An undisclosed difference between two screens showing
the same product is indistinguishable from a bug.

## Consequences

- Cutoff drift between readers becomes structurally impossible rather than a
  convention four call sites must remember.
- The dashboard's month-end cutoff disappears. Expect **more** `STALE` on the
  dashboard than today: it stops asking the easier question. That is the
  correction, not a regression.
- A day-granular cutoff also pulls the in-progress month into the evidence
  window, which changes `evaluationPeriodComplete`. Cover that with a
  regression, since nothing tests the cutoff today.
- The wall-clock read in the dashboard's inventory adapter goes away with the
  cutoff, so that separate defect is resolved by this change rather than
  independently.
