---
status: accepted
---

# ABC admits evidence on compatibility, and the official cutoff never moves backward

`MasterProductAbcService` refused to publish unless both profitability sources
reached the desired cutoff exactly and each source's newest attempt was the
selected one. A source lagging by a day, or a single collection still running,
returned `SOURCE_NOT_READY` for the whole recalculation even when a complete,
compatible generation was already sitting in the database.

That conflates two different questions. Whether evidence is **valid** is a
property of the evidence; whether it is **fresh** is a property of the clock.
Only the first can refuse a publication.

**Admission asks only what invalidates evidence:** a compatible pair exists, its
sources agree with the organization's mapping generation, and the selected
manifest's coverage reaches its own actual cutoff. Freshness signals — a source's
readiness status, a newer `RUNNING` or `FAILED` attempt over a source that
already published a complete generation — are reported to the caller and
displayed, never used as a gate.

**One separate guard refuses the single case that is genuinely wrong:** evidence
that would move the official cutoff backward, replacing a settled grade with an
older one. The transactional fence holds the same line independently, so a
concurrent publication cannot slip past the service-level check.

## Consequences

- ABC publishes at the newest cutoff every compatible complete source reaches,
  which may be earlier than the latest closed day. The actual cutoff is
  persisted and displayed next to the desired one; a reader that shows only one
  of them is showing the wrong thing.
- Evaluation-period integrity is untouched. `requiresCompleteEvaluationPeriod`
  still holds, and an internal hole still refuses to become a grade by dropping
  dates. This ADR removes an unconditional freshness barrier, nothing else.
- The publication fence pins the published generation and its manifest, which is
  what a real source correction or replacement moves. It no longer re-reads the
  newest attempt row, because an attempt that is `RUNNING` or that `FAILED`
  publishes no generation and so cannot invalidate anything.
- The fence and Finance's reader still express "which generation is current"
  as two separate rules that agree only because both collection plans end their
  coverage at KST yesterday. That coincidence is unenforced — see KID-47.
