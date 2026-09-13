Before working in this directory, always read this document first rather than relying on memory.

# scripts — Durable Repo Automation

`scripts/` owns durable repo automation. Human-facing inventory lives in
`scripts/README.md`; this file is the agent-facing contract for editing scripts.

## Script Rules

- Every top-level script needs a durable owner and entrypoint: `package.json`,
  a runbook under `docs/runbooks/`, or a CI/test gate.
- Put persisted-data rewrites in versioned migrations with a durable entrypoint.
  Keep scratch scripts, temporary SQL, and local debugging helpers outside Git.
- Adding, renaming, or deleting a script also updates:
  `scripts/README.md`, `scripts/check-script-inventory.mjs`, invoking
  package/runbook/CI references, and non-trivial script tests.
- Use sanitized synthetic fixtures. Keep secrets, real tokens, organization or
  account identifiers, names, prices, stock values, and copied marketplace
  payloads out of scripts, fixtures, comments, and expected output.
- Prefer deterministic helpers that run without the database.
- Database or external-account mutation scripts need a runbook with
  prerequisites, confirmation flags, verification, and recovery notes. Schema
  and data cutovers recover under the
  [data-loss policy](../docs/runbooks/deployment-architecture.md#data-loss-policy).
- `data-migrations/v0.1.31/003_prepare_operation_automation_cutover.ts` is the
  pre-schema half of the reviewed Operation/Automation cutover. Run it only
  through `npm run data:migrate` after the read-only preflight and writer-stop
  gate in `docs/runbooks/operation-automation-cutover.md`. It deletes only
  retired generic rows, leaves ActionTask rows to the schema step that drops
  their table, and skips tables the database no longer has.

## Verification

For script-only changes:

```bash
npm run check:scripts-inventory
npm run test:scripts
```

For convention/boundary changes:

```bash
npm run check:conventions
```
