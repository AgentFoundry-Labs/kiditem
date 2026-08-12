---
name: update-project-skills
description: Use when maintaining KidItem project-local Codex skill profiles, reusable hub exports, external skill sources, or active discovery links. Keeps source repositories separate from project discovery and never installs global skills.
metadata:
  short-description: Maintain KidItem skill profiles and exports
---

# Update Project Skills

Use this skill from inside the KidItem repository unless the user explicitly
names another project.

## Policy

- Treat `<repo>/.agents/skills` as discovery only. Its managed entries are
  symlinks selected by the active KidItem profile.
- Keep KidItem-owned skill source under `<repo>/tools/codex/skills`.
- Reuse external source checkouts through
  `~/workspace/agent-skill-hub`. The hub exports profiles but is not itself a
  Codex discovery directory.
- Do not clone duplicate source repositories. Active external repositories are
  grouped under `~/workspace/agent-skill-hub/repos`.
- Do not install or enable global entries in `~/.codex/skills`,
  `~/.agents/skills`, or Codex plugins unless the user explicitly requests it.
- Preserve unrelated project changes. Do not stage, commit, or publish skill
  maintenance unless the user asks.
- A fresh Codex task is required after changing the active discovery links.

## Sources of Truth

- KidItem profile manifest: `<repo>/tools/codex/skill-profiles.json`
- Personal KidItem overlay: `<repo>/.agents/skill-profile.local.json`
- Managed-link state: `<repo>/.agents/skill-profile-state.json`
- Shared hub profiles: `~/workspace/agent-skill-hub/profiles.json`
- Hub exports: `~/workspace/agent-skill-hub/exports/<profile>`

## Normal Workflow

1. Inspect `git status --short --branch` in KidItem.
2. Run `rtk npm run skills:update`. This updates the hub source checkouts,
   rebuilds exports, and reapplies the active KidItem profile.
3. Run `rtk npm run skills:verify`.
4. Report the active profile, exposed count, local additions/removals, resolved
   source roots, and whether a fresh task is required.

Use `rtk npm run skills:update -- --no-pull` when the source repositories must
not be updated from the network.

## KidItem Profile Commands

```bash
rtk npm run skills:profile -- list
rtk npm run skills:profile -- show default
rtk npm run skills:profile -- apply project-only
rtk npm run skills:profile -- apply default
rtk npm run skills:profile -- apply full
rtk npm run skills:profile -- add hub-full:gstack-plan-eng-review
rtk npm run skills:profile -- remove hub-kiditem:gstack-browse
rtk npm run skills:profile -- reset hub-kiditem:gstack-browse
rtk npm run skills:profile -- verify
```

Local `add` and `remove` commands write only the gitignored overlay. Add
`--shared --profile <name>` only when intentionally changing the tracked team
profile.

## Reusable Hub Commands

```bash
rtk npm run skills:hub -- list
rtk npm run skills:hub -- show core
rtk npm run skills:hub -- profile-create review core
rtk npm run skills:hub -- add review gstack:gstack-plan-eng-review
rtk npm run skills:hub -- remove review gstack:gstack-browse
rtk npm run skills:hub -- update
rtk npm run skills:hub -- verify
```

Hub profile edits affect every project that chooses that export. KidItem-local
overrides affect only KidItem.

## Verification Only

```bash
rtk npm run skills:verify
```

Verification must fail for missing exports, broken `SKILL.md` targets, profile
drift, missing required KidItem skills, or malformed manifests.
