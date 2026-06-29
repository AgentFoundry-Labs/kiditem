Consult this document first instead of relying on memorized knowledge.

# scripts — Durable Repo Automation

`scripts/` owns durable repo automation. Human-facing inventory lives in
`scripts/README.md`; this file is the agent-facing contract for editing scripts.

## Folder Map

```text
scripts/
├── __tests__/                    # script behavior tests
├── check-script-inventory.mjs    # script ownership guard
├── data-migrations/              # release-scoped data migrations
└── README.md                     # human script catalogue
```

## Owned Surfaces

- Package scripts and CI/runbook-backed repo automation
- Data migrations under `scripts/data-migrations/v<VERSION>/`
- Script inventory checks

## Script Rules

- Every top-level script needs a durable owner and entrypoint: `package.json`,
  a runbook under `docs/runbooks/`, or a CI/test gate.
- Do not commit one-off backfills, scratch scripts, temporary SQL, or local
  debugging helpers.
- Adding, renaming, or deleting a script also updates:
  `scripts/README.md`, `scripts/check-script-inventory.mjs`, invoking
  package/runbook/CI references, and non-trivial script tests.
- Do not store secrets, real tokens, local account identifiers, or copied
  marketplace data in scripts, fixtures, comments, or expected output.
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
