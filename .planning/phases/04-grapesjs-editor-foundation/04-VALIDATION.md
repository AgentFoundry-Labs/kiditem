---
phase: 4
slug: grapesjs-editor-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test framework in apps/web or packages/templates |
| **Config file** | none |
| **Quick run command** | `grep -r "oneshot" apps/web packages/` (zero-output = CLEAN-01 pass) |
| **Full suite command** | `cd apps/web && npm run build` (TypeScript compilation as correctness proxy) |
| **Estimated runtime** | ~30 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `grep -r "oneshot" apps/web packages/ 2>/dev/null | wc -l` → must be 0 after CLEAN-01 task
- **After every plan wave:** Run `cd apps/web && npm run build` — TypeScript compilation passes
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke test
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | CLEAN-01 | shell | `grep -r "oneshot" apps/web packages/` exits with no matches | ✅ (shell) | ⬜ pending |
| 04-01-02 | 01 | 1 | EDIT-02 | manual | Browser console: `editor.getCss().length` after 5 reloads | ❌ manual | ⬜ pending |
| 04-01-03 | 01 | 1 | EDIT-01 | manual | Navigate draft product → editor → GrapesJS canvas loads | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

No test framework installation needed. CLEAN-01 is verified via `grep` command. EDIT-01 and EDIT-02 are manual-only (require live GrapesJS in browser). TypeScript build serves as overall correctness proxy.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Draft entry → GrapesJS canvas | EDIT-01 | Requires running Next.js + NestJS + browser navigation | 1. Create/find draft product 2. Navigate to /sourcing/[id]/editor 3. Verify GrapesJS canvas loads with placeholder HTML |
| CSS no-accumulation on 5 reloads | EDIT-02 | Requires live GrapesJS DOM + `editor.getCss()` API | 1. Open editor 2. Record `editor.getCss().length` 3. Reload HTML 5x via `editor.setComponents()` 4. Verify length unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
