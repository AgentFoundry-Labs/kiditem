---
name: update-project-skills
description: Use when maintaining shared KidItem project-local Codex skills, especially updating GitHub-installed skills from skills-lock.json, repairing local skill installs, or verifying skill scope. Do not manage personal local tools such as gstack or superpowers, and avoid global Codex plugins or global skill installs.
metadata:
  short-description: Maintain all KidItem local Codex skills
---

# Update Project Skills

Use this skill from inside the KidItem repository, unless the user explicitly names another project.

## Policy

- Keep KidItem project-owned shared skills project-local under `<repo>/.agents/skills`.
- Keep shared project-owned skill sources under `<repo>/tools/codex/skills`.
- Treat `<repo>/.agents/` as each developer's local install/discovery target.
- Treat external personal tools such as gstack and superpowers as linked dependencies whose source lives outside KidItem.
- Do not install or enable global entries in `~/.codex/skills`, `~/.agents/skills`, or Codex plugins unless the user explicitly asks for global setup.
- Do not run package setup commands that write global Codex skill dirs unless the user explicitly asks for global setup.
- Update copied GitHub skills from `skills-lock.json`.
- Do not manage gstack or superpowers here. Those are personal local tools, not shared KidItem project skills.
- Leave local-only/custom skills unchanged unless the user asks to edit them.
- Treat existing KidItem app changes as user work. Do not revert, stage, or commit them during skill maintenance.
- After changing skills, tell the user that already-open Codex sessions may still show the old injected skill list; fresh sessions should reflect the new state.

## Source Paths

- KidItem root: detected with `git rev-parse --show-toplevel`.
- KidItem skills: `<repo>/.agents/skills`.
- Lock file for copied GitHub skills: `<repo>/skills-lock.json`.
- Source cache for GitHub skills: `<repo>/.agents/sources`.
- Shared project skill sources: `<repo>/tools/codex/skills`.

## Workflow

1. Inspect `git status --short --branch` in KidItem.
2. Run `scripts/update-local-skills.sh` from this skill directory.
3. Verify:
   - Every skill listed in `skills-lock.json` has a local directory with `SKILL.md`.
   - Shared project skills are linked into `.agents/skills`.
   - Any symlinked skills still resolve to valid `SKILL.md` files.
   - Local-only skills are reported but not overwritten.
   - gstack and superpowers are not created or updated by this workflow; only existing symlinks are checked for validity.
4. Report what changed and whether a fresh Codex session is needed.

## Verification Only

When the user only asks to check the setup, run:

```bash
tools/codex/skills/update-project-skills/scripts/update-local-skills.sh --verify-only
```
