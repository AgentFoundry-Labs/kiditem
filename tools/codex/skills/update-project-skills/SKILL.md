---
name: update-project-skills
description: Maintain KidItem project-local Codex skill profiles, reusable hub exports, external skill sources, and active discovery links. Use when updating or verifying skills, switching the active KidItem profile, changing its selected skills, managing a reusable hub profile, registering an existing source checkout, or repairing profile drift. Never installs skills globally.
---

# Update Project Skills

Run from the KidItem repository.

## Guardrails

- Treat `.agents/skills` as discovery-only symlinks selected by the active
  profile. Keep KidItem-owned sources under `tools/codex/skills` and external
  sources under `~/workspace/agent-skill-hub/repos`.
- Preserve unrelated repository changes and avoid global Codex skill locations.
- Read [`docs/runbooks/codex-skill-profiles.md`](../../../../docs/runbooks/codex-skill-profiles.md)
  only when switching profiles, changing selections, managing hub profiles or
  sources, interpreting paths and environment overrides, or resolving a
  blocker.

## Default Workflow

1. Inspect `rtk git status --short --branch`.
2. Run `rtk npm run skills:update`. Use `-- --no-pull` when existing local
   source revisions must be retained.
3. Run `rtk npm run skills:verify`.
4. Report the active profile, exposed count, local additions/removals, resolved
   source roots, verification result, and whether a fresh Codex task is needed.

For inspection without mutation, run only `rtk npm run skills:verify`.
