Before working in this directory, always read this document first rather than relying on memory.

# Superpowers Document Archive

**Deprecated 2026-09-12.** This directory is frozen. In-flight design is a
Linear spec issue (`docs/agents/issue-tracker.md`); settled decisions are ADRs
in `docs/adr/`. Do not add files here and do not edit existing ones to reflect
later decisions. Nothing here is a contract for a current change.

The lifecycle rules below describe how the archived documents were maintained
and remain useful for reading them.

Plans and specs in this directory are execution records as well as design
inputs. Their status determines whether they are authoritative.

- Every new document, and every existing document selected for active work,
  declares `**Status:** ACTIVE`, `COMPLETED`, or `SUPERSEDED` near the top.
- Only an `ACTIVE` plan and its linked active spec are current implementation
  requirements. Reviews do not treat completed, superseded, or unrelated
  historical documents as contracts for the current change.
- An active plan may change as decisions are approved and may update its task
  checkboxes. Record material deviations in that plan before completing it.
- After implementation finishes, set the document status to `COMPLETED` and
  freeze its body. Later code changes do not trigger retroactive rewrites.
- Replacing a document changes only its lifecycle metadata to `SUPERSEDED` and
  adds `**Superseded by:**` with the successor path. Put the new contract in the
  successor instead of reconciling the old body.
- Use `**Supersedes:**` in a successor when applicable. Update lifecycle status
  only for documents entering or leaving active work; preserve unrelated
  historical documents unless the user requests archival cleanup.
- Per-task agent allocation, model choice, and review cadence belong in the
  active task or plan, not in archived documents or CLAUDE.md.
