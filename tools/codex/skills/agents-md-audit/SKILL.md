---
name: agents-md-audit
description: Use when auditing, creating, refactoring, or reviewing AGENTS.md files in a repository, especially checking Codex discovery scope, nested guide inheritance, size budget, verification commands, Folder Map usefulness, override files, or stale agent instructions.
---

# AGENTS.md Audit

## Overview

Audit `AGENTS.md` as durable agent onboarding, not as a file inventory. Prefer
short root guidance, scoped nested contracts, explicit verification, and fresh
discovery of the guides that apply to the files being changed.

## Workflow

1. Discover instruction files:

   ```bash
   rg --files -g AGENTS.md -g AGENTS.override.md
   ```

2. Run the bundled audit script from the repository root:

   ```bash
   node <skill-dir>/scripts/audit-agents-md.mjs --root .
   ```

   Use `--limit 32768` to match Codex's default project instruction byte cap,
   and `--target path/to/dir` for a specific work area.

3. Read the active chain for the target path from root to nearest guide. If the
   work moves into another nested area, rerun discovery and read the new chain.

4. Review content with the criteria below. Make edits only after confirming the
   nearest applicable `AGENTS.md` files.

5. Verify with repository hygiene checks, then report evidence.

## Audit Criteria

| Area | Good | Fix |
|---|---|---|
| Discovery | Root tells agents to find scoped guides before editing. | Agents rely on memory or a stale route table. |
| Scope | Root has global contracts; nested files add local exceptions. | Same commands/rules repeated in many children. |
| Size | Active chain stays under the configured byte cap; aim below 28 KiB. | Root or parent files grow with route inventories. |
| Verification | Local `Verification` exists only for different or narrower gates. | Every file repeats the same build command. |
| Folder maps | Map encodes ownership, architecture, or exception contracts. | Map only duplicates `rg --files` output. |
| Overrides | `AGENTS.override.md` is rare and intentional. | Override accidentally hides sibling `AGENTS.md`. |
| Compatibility | `CLAUDE.md` or legacy files point to `AGENTS.md` when needed. | Parallel instruction files drift. |

## Editing Rules

- Keep durable guidance in `AGENTS.md`, docs, or inseparable source comments.
- Prefer deleting stale lists over refreshing them.
- Preserve nested files when they carry local ownership, boundary, or
  verification details.
- Add commands only when they are runnable from the expected directory.
- Keep examples short; link to durable docs for long explanations.
- Do not add `AGENTS.override.md` unless the user explicitly wants to hide the
  normal file at that directory.

## Useful Checks

```bash
npm run check:agents-hygiene
git diff --check
node <skill-dir>/scripts/audit-agents-md.mjs --root . --top 12
```

For Codex-specific behavior, prefer current OpenAI Codex docs. For generic
format guidance, compare against `https://agents.md/`.

## Report Format

Include:

- Active-chain sizes for the largest or requested targets.
- Counts for `AGENTS.md`, `AGENTS.override.md`, `Folder Map`, and
  `Verification`.
- Findings grouped as `Keep`, `Remove`, `Move`, or `Clarify`.
- Verification commands run and their exit status.
