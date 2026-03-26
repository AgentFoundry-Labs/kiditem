---
phase: 2
slug: python-agent-split
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio (installed in Plan 03 Wave 3) |
| **Config file** | `agents/pytest.ini` (created in Plan 03) |
| **Quick run command** | `cd agents && python -c "from src.agents.content.agent import ContentAgent; print('import OK')"` |
| **Full suite command** | `cd agents && .venv/bin/pytest tests/ -v --tb=short` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PIPE-04 | import | `cd agents && python -c "from src.agents.content.models import GenerationMode; print(list(GenerationMode))"` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | PIPE-04 | import | `cd agents && python -c "from src.core.ai_client import AIClient; print('fal methods OK')"` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | PIPE-01, PIPE-04, PIPE-05 | grep | `grep -n "run_step1" agents/src/agents/content/template_pipeline.py` | ✅ | ⬜ pending |
| 02-02-02 | 02 | 2 | PIPE-02, PIPE-03, PIPE-06 | grep | `grep -n "run_step2\|draft_snapshot\|hero_image_url" agents/src/agents/content/agent.py` | ✅ | ⬜ pending |
| 02-03-01 | 03 | 3 | PIPE-01~06 | pytest | `cd agents && .venv/bin/pytest --co -q tests/` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 3 | PIPE-01~06 | pytest | `cd agents && .venv/bin/pytest tests/ -v --tb=short` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `agents/tests/conftest.py` — shared fixtures (mock pool, sample data)
- [ ] `agents/tests/test_content_agent.py` — ContentAgent routing tests
- [ ] `agents/tests/test_template_pipeline.py` — Pipeline step1/step2 tests
- [ ] `agents/pytest.ini` — pytest configuration
- [ ] `pip install pytest pytest-asyncio` — test framework in agents venv

*Plan 03 (Wave 3) serves as the test infrastructure wave.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Step 1 writes draftContent, no FAL.AI calls | PIPE-01 | Requires running agent against live DB + AI APIs | Create agent_task with mode=draft, verify draftContent populated |
| Step 2 reads snapshot, generates images | PIPE-02, PIPE-03 | Requires FAL.AI live API | Create agent_task with mode=image + snapshot, verify processedData |
| Size chart OCR preserved | PIPE-05 | Requires live PaddleOCR | Verify size_indices in draftContent after Step 1 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-26
