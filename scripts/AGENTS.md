# Scripts Instructions

`scripts/README.md` is the human catalogue. This file is the agent-facing
contract for Codex, Claude, and other repo agents editing `scripts/`.

## Edit Contract

- Every top-level script must have a durable owner and an entrypoint:
  `package.json`, a runbook under `docs/runbooks/`, or a CI/test gate.
- Do not commit one-off backfills, session scratch scripts, temporary SQL, or
  local debugging helpers. Keep those outside git unless they become a durable
  runbook-backed command.
- When adding, renaming, or deleting a script, update all of these in the same
  PR:
  - `scripts/README.md`
  - `scripts/check-script-inventory.mjs`
  - package/runbook/CI references that invoke it
  - script tests under `scripts/__tests__/` when behavior is non-trivial
- Do not store secrets, real tokens, or local account identifiers in scripts,
  fixtures, comments, or expected output.
- Prefer small deterministic helpers that can run without the database. If a
  script mutates a database or external account, it needs a runbook with
  prerequisites, confirmation flags, verification, and rollback/blocker notes.

## Verification

For script-only changes run:

```bash
npm run check:scripts-inventory
npm run test:scripts
```

For PRs that also touch repo conventions or boundaries run:

```bash
npm run check:conventions
```

`scripts/check-script-inventory.mjs` is the guard against script sprawl. If it
fails, either remove the unowned script or promote it into the inventory with a
real entrypoint and test/runbook coverage.
