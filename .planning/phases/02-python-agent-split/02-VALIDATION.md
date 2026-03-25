---
phase: 2
slug: python-agent-split
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python: manual verification via asyncpg queries; TypeScript: `npx tsc --noEmit` |
| **Config file** | none |
| **Quick run command** | `cd agents && python -c "from src.agents.content.agent import ContentAgent; print('import OK')"` |
| **Full suite command** | `cd agents && python -c "from src.agents.content.agent import ContentAgent; print('import OK')" && cd .. && npx tsc --noEmit -p apps/server/tsconfig.json` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PIPE-04 | import | Python import check | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | PIPE-01, PIPE-05 | import | Python import check | ✅ | ⬜ pending |
| 02-02-01 | 02 | 1 | PIPE-01, PIPE-05 | schema | grep draftContent in agent.py | ✅ | ⬜ pending |
| 02-02-02 | 02 | 1 | PIPE-02, PIPE-03, PIPE-06 | schema | grep hero_image_url in agent.py | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No test framework setup needed — verification is via import checks, grep, and manual DB queries.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Step 1 writes draftContent, no FAL.AI calls | PIPE-01 | Requires running agent against live DB + AI APIs | Create agent_task with mode=draft, verify draftContent populated |
| Step 2 reads snapshot, generates images | PIPE-02, PIPE-03 | Requires FAL.AI live API | Create agent_task with mode=image + snapshot, verify processedData |
| Size chart OCR preserved | PIPE-05 | Requires live PaddleOCR | Verify size_indices in draftContent after Step 1 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
