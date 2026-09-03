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
  prerequisites, confirmation flags, verification, and rollback/blocker notes.

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
