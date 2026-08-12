# Codex Skill Hub and Project Profiles

**Date:** 2026-08-12
**Status:** Implemented
**Classification:** Cross-domain instruction cleanup. AgentOS and PR #476 are
out of scope.

## Decision

Separate external skill source repositories, reusable skill combinations, and
per-project discovery:

```text
agent-skill-hub/repos
        ↓
agent-skill-hub/exports/<profile>
        ↓
kiditem/.agents/skills
```

The hub is a workspace-level harness. It is not under `~/.codex/skills` or
`~/.agents/skills`, so its repositories and exports are not globally
discovered. A project must explicitly link selected skills into its own
`.agents/skills` directory.

This follows the useful part of the Hermes desktop update model: update an
existing Git checkout, prepare generated artifacts, and use the refreshed
source in place. KidItem does not copy Hermes backup, rollback, or config
migration flows.

## Workspace Hub

The hub lives at `~/workspace/agent-skill-hub`:

```text
agent-skill-hub/
├── profiles.json
├── profiles.local.json       # optional, gitignored
├── manage.mjs
├── repos/                    # gitignored source repositories
│   ├── gstack/
│   ├── superpowers/
│   ├── understand-anything/
│   └── supabase-agent-skills/
├── sources/                  # generated stable aliases
└── exports/                  # generated profile symlinks
    ├── core/
    ├── kiditem/
    └── full/
```

The prior top-level workspace paths for gstack, Superpowers, and Understand
Anything are compatibility symlinks into `repos/`. No duplicate active clone is
created.

Retired Lum1104, mattpocock, and Vercel skill source checkouts were removed at
the user's direction. The Hermes Agent checkout under KidItem remains untouched
because it belongs to the AgentOS/PR #476 scope.

## Reusable Profiles

`core` exports 16 skills:

- nine Superpowers workflow skills;
- the gstack runtime sidecar and four selected gstack leaf skills; and
- `understand-diff` and `understand-domain`.

`kiditem` exports the 16 `core` skills plus:

- `supabase`; and
- `supabase-postgres-best-practices`.

`full` expands every immediate child directory containing `SKILL.md` from all
four active repositories.

The hub supports listing, showing, exporting, creating, adding to, removing
from, updating, verifying, and registering machine-local sources. A leaf
removed from a wildcard-based profile is recorded as an exclusion.

## KidItem Profiles

The tracked manifest is `tools/codex/skill-profiles.json`. It defines:

- three required KidItem-owned skills;
- `project-only`, containing only required KidItem skills;
- `default`, selecting `hub-kiditem:*`; and
- `full`, selecting `hub-full:*`.

The optional `.agents/skill-profile.local.json` records the active profile,
local additions, local removals, and local source aliases. It is gitignored.

The default active discovery contains 21 skills: three KidItem skills and the
18-skill hub `kiditem` export.

## Reconciliation

The KidItem manager:

1. validates the tracked manifest and optional local overlay;
2. resolves required, profile, add, and remove selectors;
3. expands `source:*` only across immediate children containing `SKILL.md`;
4. rejects missing sources, missing skills, duplicate exposed names with
   different targets, and real-directory conflicts;
5. removes links recorded in manager state or recognized under registered
   sources;
6. creates the desired symlinks; and
7. writes `.agents/skill-profile-state.json` for drift verification.

Unknown real directories are never deleted by the manager. There is no backup,
rollback, or legacy migration engine.

## Updating

`npm run skills:update` runs the simple update sequence:

1. pull each existing hub repository from its configured origin and branch;
2. prepare gstack's generated Codex skills and runtime artifacts;
3. regenerate all hub exports;
4. reapply the active KidItem profile; and
5. verify hub exports and project discovery.

`npm run skills:update -- --no-pull` skips Git pulls and rebuilds discovery from
the current local source revisions.

The hub refuses an unexpected Git remote and never clones a missing source
repository automatically.

## Local and Shared Changes

KidItem-only selection changes use:

```text
npm run skills:profile -- add hub-full:<skill>
npm run skills:profile -- remove hub-kiditem:<skill>
```

Reusable cross-project combinations use:

```text
npm run skills:hub -- profile-create <new> <base>
npm run skills:hub -- add <profile> <source:skill>
npm run skills:hub -- remove <profile> <source:skill>
```

Another project opts in by registering the desired hub export as a directory
source. Creating an export alone does not expose it to Codex.

## Verification

Required checks are:

```bash
rtk npm run skills:hub -- verify
rtk npm run skills:profile -- verify
rtk npm run skills:verify
rtk npm run check:agents-hygiene
rtk git diff --check
```

Already-open Codex tasks keep their injected skill metadata. Start a fresh task
after switching or editing an active profile.
