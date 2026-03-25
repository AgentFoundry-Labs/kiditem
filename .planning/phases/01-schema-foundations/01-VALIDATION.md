---
phase: 1
slug: schema-foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no test framework in project) |
| **Config file** | none |
| **Quick run command** | `npx prisma generate && npx tsc --noEmit -p apps/server/tsconfig.json` |
| **Full suite command** | `npx prisma generate && npx tsc --noEmit -p apps/server/tsconfig.json` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx prisma generate && npx tsc --noEmit -p apps/server/tsconfig.json`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SCHM-01 | schema | `npx prisma generate` | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | SCHM-02 | schema | `npx prisma generate` | ✅ | ⬜ pending |
| 01-01-03 | 01 | 1 | SCHM-01, SCHM-02 | compile | `npx tsc --noEmit -p apps/server/tsconfig.json` | ✅ | ⬜ pending |
| 01-01-04 | 01 | 1 | SCHM-01, SCHM-02 | db | `npm run db:push` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing products load in editor without error | SCHM-01, SCHM-02 | Requires running app + browser | Start app, navigate to /sourcing/[id]/editor for a product with processedData |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
