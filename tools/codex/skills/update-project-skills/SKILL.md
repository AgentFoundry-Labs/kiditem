---
name: update-project-skills
description: Maintain KidItem-owned Codex skill links. Use when updating or verifying the project's three local skills or repairing project discovery drift. Never manages globally installed Development plugin skills.
---

# Update Project Skills

Run from the KidItem repository.

## Guardrails

- Treat `.agents/skills` as discovery-only symlinks selected by the active
  project setup. Keep KidItem-owned sources under `tools/codex/skills`.
- Shared development skills come from the globally installed
  `development@agent-skill-hub` plugin and stay outside this workflow.
- Preserve unrelated repository changes and global Codex skill locations.
- Read [`docs/runbooks/codex-skill-profiles.md`](../../../../docs/runbooks/codex-skill-profiles.md)
  when setting up another computer, interpreting ownership boundaries, or
  resolving a blocker.

## Default Workflow

1. Inspect `rtk git status --short --branch`.
2. Run `rtk npm run skills:update`.
3. Run `rtk npm run skills:verify`.
4. Report the three exposed project skills, verification result, and whether a
   fresh Codex task is needed.

For inspection without mutation, run only `rtk npm run skills:verify`.
