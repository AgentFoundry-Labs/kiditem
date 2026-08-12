# Codex Skill Profiles

## Purpose

KidItem exposes a small, explicit Codex skill set without globally enabling
every installed gstack, Superpowers, or Understand Anything skill.

The setup has three layers:

```text
existing Git repositories
        ↓
~/workspace/agent-skill-hub/exports/<profile>
        ↓
kiditem/.agents/skills/<selected-skill>
```

The hub and its exports are not Codex discovery paths. A skill becomes visible
to KidItem only when the KidItem profile manager links it into
`.agents/skills`.

AgentOS and its PR are outside this workflow.

## Local Harness Boundary

KidItem's `.agents/` directory contains only:

- `skills/`: active discovery links selected by the profile;
- `skill-profile.local.json`: the developer's active profile and overrides;
- `skill-profile-state.json`: the manager's last applied link state.

Do not put repository checkouts, generated catalogs, temporary schemas, or
top-level compatibility links under `.agents/`. External sources belong in the
workspace hub, and generated tool output stays in its tool-owned ignored
directory.

The profile manager reconciles `.agents/skills` only. It deliberately never
deletes arbitrary dot-directories: `.github`, `.githooks`, `.secrets`,
`.dev-auth`, and active `.worktrees` have unrelated owners. Tool output such as
`.gstack`, `.superpowers`, and `.understand-anything` may be removed when its
reports are no longer needed and will be recreated on demand.

## Prerequisites

The hub keeps active external repositories in one place and does not clone
replacements during normal updates:

```text
~/workspace/agent-skill-hub/repos/superpowers
~/workspace/agent-skill-hub/repos/gstack
~/workspace/agent-skill-hub/repos/understand-anything
~/workspace/agent-skill-hub/repos/supabase-agent-skills
```

The former top-level workspace paths remain compatibility symlinks.

The default hub location is `~/workspace/agent-skill-hub`. Set
`AGENT_SKILL_HUB_ROOT` to an absolute path when KidItem must use another
location. Both `skills:hub` and `skills:update` honor it. The tracked
KidItem manifest also supports `AGENT_SKILL_HUB_KIDITEM` and
`AGENT_SKILL_HUB_FULL` overrides that point directly to export directories.

If a source repository is missing, stop and restore or register the intended
existing checkout. The update workflow does not silently clone another copy.

## Profiles

KidItem profiles are defined in `tools/codex/skill-profiles.json`:

- `project-only`: three KidItem-owned skills;
- `default`: `project-only` plus the hub `kiditem` export;
- `full`: `project-only` plus every skill in the hub `full` export.

The shared hub profiles are defined in
`~/workspace/agent-skill-hub/profiles.json`:

- `core`: the selected Superpowers workflow skills, gstack runtime plus four
  leaf skills, and two Understand Anything skills;
- `kiditem`: `core` plus the two selected Supabase skills;
- `full`: every valid immediate child skill from all four active sources.

## Inspect and Switch KidItem

```bash
rtk npm run skills:profile -- list
rtk npm run skills:profile -- show default
rtk npm run skills:profile -- apply project-only
rtk npm run skills:profile -- apply default
rtk npm run skills:profile -- apply full
```

`apply` records the active profile in the gitignored
`.agents/skill-profile.local.json` and reconciles discovery links.

## Add or Remove Skills Only in KidItem

Use `hub-full` when selecting a skill that is not in `core`:

```bash
rtk npm run skills:profile -- add hub-full:gstack-plan-eng-review
rtk npm run skills:profile -- remove hub-kiditem:gstack-browse
rtk npm run skills:profile -- reset hub-kiditem:gstack-browse
rtk npm run skills:profile -- apply default
```

These commands update the local overlay and do not require a PR. Required
KidItem skills cannot be removed. `reset` clears both local add and remove
overrides for the qualified selector.

## Create a Reusable Combination

Create and edit a profile in the shared hub when more than one project should
use the same combination:

```bash
rtk npm run skills:hub -- profile-create review core
rtk npm run skills:hub -- add review gstack:gstack-plan-eng-review
rtk npm run skills:hub -- remove review gstack:gstack-browse
rtk npm run skills:hub -- export review
```

If the base profile uses `source:*` (for example `full`), removing one leaf
records a profile exclusion; the wildcard does not add that skill back.

Another project can register
`~/workspace/agent-skill-hub/exports/review` as a directory source and select
`source:*`. Nothing is exposed globally merely by creating an export.

To register another existing source repository on this machine:

```bash
rtk npm run skills:hub -- source-add my-skills /absolute/repo/path skills
```

This writes the hub's gitignored `profiles.local.json`.

## Update

```bash
rtk npm run skills:update
```

The command performs this simple sequence:

1. update the existing hub source repositories from their configured GitHub
   origins;
2. rebuild gstack artifacts when source code was pulled;
3. regenerate all hub exports;
4. reapply and verify the active KidItem profile.

Use the existing local source revisions without network pulls:

```bash
rtk npm run skills:update -- --no-pull
```

The workflow does not create backups, clone duplicate suite repositories, or
install global Codex skills.

## Verification

```bash
rtk npm run skills:verify
rtk npm run skills:profile -- verify
rtk npm run skills:hub -- verify
```

Verify checks:

- hub exports match their profile manifests;
- every exposed entry resolves to `SKILL.md`;
- required project skills are present;
- active discovery matches the selected KidItem profile; and
- no unmanaged real directories occupy selected discovery names; and
- no legacy source/cache roots remain directly under `.agents/`.

## Blockers

Stop and report the exact path when:

- a configured source repository or hub export is missing;
- a Git remote differs from the configured origin;
- an unknown real directory conflicts with a selected skill name;
- two selected sources export the same skill name to different targets; or
- gstack preparation requires unavailable Bun tooling.

## Final Report

Report:

- active KidItem profile and exposed count;
- local additions and removals;
- resolved hub and project source roots;
- hub profile counts;
- verification commands and exit codes; and
- that a fresh Codex task is required to reload injected skill metadata.
