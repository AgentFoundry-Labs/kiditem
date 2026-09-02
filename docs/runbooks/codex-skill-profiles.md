# Codex Skill Profiles

## Purpose

Shared development skills and KidItem-owned skills have separate owners:

```text
agent-skill-hub marketplace -> Development plugin -> global Codex skills
KidItem tools/codex/skills  -> .agents/skills    -> project-only skills
```

KidItem never clones external skill repositories or exports shared profiles.
The Development plugin follows the latest configured upstream revisions and
keeps its repositories under Codex-managed plugin data.

## Set Up Another Computer

Install the shared Development profile from the private Git marketplace:

```bash
rtk codex plugin marketplace add yhc125/agent-skill-hub --ref main
rtk codex plugin add development@agent-skill-hub
```

The GitHub account used by Git must be able to read the repository. No manual
clone of `agent-skill-hub`, gstack, Ponytail, Understand Anything, Supabase, or
another included source is required. Superpowers is not part of the Development
profile because its workflow overlaps with the selected gstack skills.

Refresh the marketplace package after its profile or plugin code changes:

```bash
rtk codex plugin marketplace upgrade agent-skill-hub
rtk codex plugin add development@agent-skill-hub
```

The trusted plugin hook refreshes upstream skill revisions during normal Codex
use. Plugin cache and plugin-data directories are managed runtime state, not
duplicate workspace clones; do not remove them manually.

## KidItem-Owned Skills

KidItem always exposes these repository-owned skills:

- `agents-md-audit`
- `kiditem-market-sourcing-radar`
- `update-project-skills`

Their sources live under `tools/codex/skills`. The gitignored `.agents/skills`
directory contains only relative symlinks to those sources. The update command
owns that discovery directory: it removes external symlinks and refuses to
overwrite real files or directories.

## Update And Verify

Apply the fixed project-local set:

```bash
rtk npm run skills:update
```

Verify without changing links:

```bash
rtk npm run skills:verify
```

Both commands verify that every link resolves to `SKILL.md` and that a fresh
Codex prompt exposes all three KidItem-owned skills. Start a fresh Codex task
after changing links so injected skill metadata is reloaded.

## Boundaries And Blockers

Keep `.agents/` limited to `skills/`. Source checkouts, generated catalogs,
temporary schemas, and tool output belong to their respective owners.

Stop and report the exact path when:

- a KidItem-owned source lacks `SKILL.md`;
- a real file or directory occupies a managed discovery name;
- an unexpected real path exists under `.agents/skills`; or
- the Development plugin reports an unhealthy managed runtime.

## Final Report

Report the three project-local skills, Development plugin health when relevant,
verification commands and exit codes, and whether a fresh Codex task is needed.
