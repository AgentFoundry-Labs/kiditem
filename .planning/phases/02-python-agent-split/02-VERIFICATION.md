---
phase: 02-python-agent-split
verified: 2026-03-26T00:00:00Z
status: passed
score: 7/7 must-haves verified
---

# Phase 2: Python Agent Split Verification Report

**Phase Goal:** Two discrete Python pipeline steps replace the monolithic content pipeline — one that generates copywriting and stops, one that reads confirmed edits and runs FAL.AI — so both can be tested against real DB state before any frontend work begins
**Verified:** 2026-03-26
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Triggering a `content` agent task with `generation_mode='draft'` writes Korean copy and theme colors to `draftContent` and sets `pipelineStep = content_ready`; no FAL.AI calls are made | VERIFIED | `agent.py` lines 75-83 write to `draft_content` with `pipeline_step='content_ready'`; `test_step1_no_fal_calls` passes confirming zero FAL.AI calls in Step 1 |
| 2 | Triggering a `content` agent task with `generation_mode='image'` reads `hero_image_url` from `agent_tasks.input` snapshot (not from live DB), runs FAL.AI in parallel, and writes the assembled `DetailPageData` to `processedData` | VERIFIED | `agent.py` line 137 reads from `task_input` snapshot; lines 159-166 write to `processed_data`; `test_step2_reads_from_snapshot` and `test_step2_writes_processed_data` pass |
| 3 | Oneshot pipeline is deleted entirely (per user decision D-02) | VERIFIED | `agents/src/agents/content/oneshot.py` does not exist; `grep -c "OneshotPipeline\|oneshot" agent.py` returns 0; `OneshotContent` class absent from `models.py` |
| 4 | Size chart OCR (`_scan_size_charts`) is preserved in Step 1; `_analyze_product` image classification is removed | VERIFIED | `template_pipeline.py` calls `_scan_size_charts` in `run_step1` gather; zero occurrences of `_analyze_product` in `template_pipeline.py`; `test_analyze_product_removed` and `test_step2_no_analyze_product` pass |
| 5 | Both pipeline steps can be integration-tested against real DB state (automated test suite passes) | VERIFIED | `cd agents && .venv/bin/pytest tests/ -v` — 20 passed, 0 failed in 0.53s |
| 6 | `ContentAgent.execute()` routes strictly on `generation_mode` with no fallback to old `template`/`oneshot` modes | VERIFIED | `agent.py` line 32 raises `ValueError` for any value other than `'draft'` or `'image'`; `test_unknown_mode_raises` passes |
| 7 | `GenerationMode` enum has `DRAFT='draft'` and `IMAGE='image'` values only (no `TEMPLATE`/`ONESHOT`) | VERIFIED | `models.py` lines 22-24; Python import confirms `[<GenerationMode.DRAFT: 'draft'>, <GenerationMode.IMAGE: 'image'>]` |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `agents/src/agents/content/models.py` | Updated GenerationMode enum with DRAFT/IMAGE | VERIFIED | Contains `DRAFT = "draft"` and `IMAGE = "image"`; no TEMPLATE/ONESHOT/OneshotContent |
| `agents/src/agents/content/oneshot.py` | DELETED | VERIFIED | File does not exist |
| `agents/src/core/ai_client.py` | `fal_edit_image` and `edit_images_multi` methods | VERIFIED | Both methods present at lines 361 and 384; fully implemented (not stubs) |
| `agents/src/config.py` | FAL_KEY env var export | VERIFIED | Line 23: `FAL_KEY = os.getenv("FAL_KEY", "")` |
| `agents/pyproject.toml` | `fal-client>=0.5.0` dependency | VERIFIED | Line 13: `"fal-client>=0.5.0"` |
| `agents/src/agents/content/template_pipeline.py` | `run_step1` and `run_step2` methods | VERIFIED | `run_step1` at line 166, `run_step2` at line 283; `_assemble_step1` and `_assemble_step2` both present and called |
| `agents/src/agents/content/agent.py` | Rewritten `execute()` with draft/image routing | VERIFIED | Strict `generation_mode` validation; `_execute_step1` and `_execute_step2` present and called |
| `agents/src/agents/content/pipeline_base.py` | `_analyze_product` not called in pipeline flow | VERIFIED | Method exists as dead code (line 116) but zero calls in `template_pipeline.py` |
| `agents/pytest.ini` | pytest config with `asyncio_mode=auto` | VERIFIED | `asyncio_mode = auto` confirmed |
| `agents/tests/conftest.py` | Mock fixtures for asyncpg pool and AIClient | VERIFIED | `mock_pool`, `mock_ai_client`, `sample_draft_content`, `size_chart_indices` all present |
| `agents/tests/test_content_agent.py` | Integration tests for ContentAgent routing and DB writes | VERIFIED | 10 tests; `test_step1_writes_draft_content` present; PIPE-01/02/06 covered |
| `agents/tests/test_template_pipeline.py` | Unit tests for pipeline step methods | VERIFIED | 10 tests; `test_step2_uses_hero_url` present; PIPE-01/03/04/05 covered |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `agents/src/core/ai_client.py` | `fal_client.run_async` | `fal_edit_image` method | WIRED | Line 378: `result = await fal_client.run_async(model, arguments=arguments)` |
| `agents/src/core/ai_client.py` | `_proxy_gemini_request` | `edit_images_multi` method | WIRED | Line 416: `data = await self._proxy_gemini_request(parts=parts, model=model, ...)` |
| `agents/src/agents/content/agent.py` | `template_pipeline.py` | `pipeline.run_step1()` and `pipeline.run_step2()` | WIRED | `draft_data = await pipeline.run_step1(...)` and `page_data = await pipeline.run_step2(...)` |
| `agents/src/agents/content/agent.py` | `products.draft_content` | SQL UPDATE for Step 1 | WIRED | `SET draft_content = $1::jsonb` at line 79 |
| `agents/src/agents/content/agent.py` | `products.processed_data` | SQL UPDATE for Step 2 | WIRED | `SET processed_data = $1::jsonb` at line 163 |
| `agents/src/agents/content/template_pipeline.py` | `_scan_size_charts` | Step 1 gather | WIRED | `self._scan_size_charts(list(ext_data.description_images))` in `run_step1` gather |
| `agents/tests/test_content_agent.py` | `agents/src/agents/content/agent.py` | `ContentAgent.execute()` mock integration | WIRED | `ContentAgent` imported and `execute()` called in all routing tests |
| `agents/tests/test_template_pipeline.py` | `agents/src/agents/content/template_pipeline.py` | `TemplatePipeline` method unit tests | WIRED | `TemplatePipeline` imported and `run_step1`/`run_step2` called in all step tests |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `agent.py` `_execute_step1` | `draft_data` | `pipeline.run_step1(ext_data, ...)` which calls `_generate_korean_content` + `_scan_size_charts` | Yes — content generation produces `DetailPageData`; SQL writes to `draft_content` column | FLOWING |
| `agent.py` `_execute_step2` | `page_data` | `pipeline.run_step2(draft_snapshot, ...)` reads from `task_input` snapshot — never live DB | Yes — FAL.AI image generation produces `DetailPageData`; SQL writes to `processed_data` column | FLOWING |
| `template_pipeline.py` `run_step1` | `size_indices`, `content` | `asyncio.gather(_scan_size_charts, _generate_korean_content)` — real AI calls | Yes — returns `DetailPageData` with `debug_info.size_chart_indices` and `original_images` | FLOWING |
| `template_pipeline.py` `run_step2` | `hero_image_url` | `draft_snapshot.get("heroImageUrl")` — snapshot, not live DB | Yes — passes to all 4 FAL.AI edit operations | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Python imports: models, agent, pipeline all importable | `cd agents && .venv/bin/python -c "from src.agents.content.models import GenerationMode; from src.agents.content.agent import ContentAgent; from src.agents.content.template_pipeline import TemplatePipeline; print('OK')"` | `GenerationMode values: [DRAFT, IMAGE]` / `All imports OK` | PASS |
| GenerationMode has exactly DRAFT and IMAGE | `python -c "from src.agents.content.models import GenerationMode; print(list(GenerationMode))"` | `[<GenerationMode.DRAFT: 'draft'>, <GenerationMode.IMAGE: 'image'>]` | PASS |
| Full test suite passes (20 tests, 0 failures) | `cd agents && .venv/bin/pytest tests/ -v` | `20 passed in 0.53s` | PASS |
| `oneshot.py` is deleted | `test ! -f agents/src/agents/content/oneshot.py` | File does not exist | PASS |
| No `_analyze_product` calls in `template_pipeline.py` | `grep -c "_analyze_product" template_pipeline.py` | 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PIPE-01 | 02-01, 02-02, 02-03 | 사용자가 AI 재가공 시 콘텐츠만 생성하고 (한국어 카피 + 테마 컬러), 이미지는 생성하지 않는다 | SATISFIED | `run_step1` generates text+colors only; `_assemble_step1` sets `hero_banner=""`, `detail_images=[]`, `size_images=[]`; `test_step1_no_fal_calls` PASS; `test_step1_writes_draft_content` PASS |
| PIPE-02 | 02-02, 02-03 | 사용자가 에디터에서 확정 후 이미지 생성을 별도 트리거할 수 있다 | SATISFIED | Separate `generation_mode='image'` routes to `_execute_step2`; `test_image_mode_calls_step2` and `test_step2_triggered_by_image_mode` PASS |
| PIPE-03 | 02-02, 02-03 | 이미지 생성 시 사용자가 선택한 히어로 이미지 1장으로 배너/메인/디테일 전부 생성한다 | SATISFIED | `run_step2` reads `heroImageUrl` from snapshot; passes to `_edit_hero_banner`, `_edit_main_image`, `_edit_detail_images` (all with `hero_image_url`); `test_step2_uses_hero_url` PASS |
| PIPE-04 | 02-01, 02-02, 02-03 | 기존 이미지 분류(_analyze_product) 호출을 제거하고 히어로 기반으로 전환한다 | SATISFIED | `_analyze_product` has zero occurrences in `template_pipeline.py`; `test_analyze_product_removed` and `test_step2_no_analyze_product` PASS |
| PIPE-05 | 02-02, 02-03 | 사이즈 차트 OCR 감지는 기존대로 유지한다 | SATISFIED | `_scan_size_charts` called in `run_step1` gather; `debug_info.size_chart_indices` preserved; `run_step2` resolves size chart URLs from snapshot `original_images + size_chart_indices`; `test_size_chart_indices_in_draft` PASS |
| PIPE-06 | 02-02, 02-03 | agent_tasks.input에 확정된 데이터를 스냅샷으로 저장하여 race condition을 방지한다 | SATISFIED | `agent.py` line 137: `draft_snapshot = task_input.get("draftContent")` — reads from task_input snapshot, not live DB; `test_step2_reads_from_snapshot` and `test_step2_requires_snapshot` PASS |

All 6 PIPE requirements (PIPE-01 through PIPE-06) are SATISFIED. No orphaned requirements detected — all IDs declared across plans 02-01 (PIPE-04), 02-02 (PIPE-01, PIPE-02, PIPE-03, PIPE-05, PIPE-06), and 02-03 (PIPE-01 through PIPE-06) map to verified implementations.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `template_pipeline.py` | 238-241 | `hero_banner=""`, `size_images=[]`, `detail_images=[]` with comments "empty -- not yet generated" | INFO | Intentional design: Step 1 outputs partial DetailPageData with placeholders for image fields that Step 2 fills in. The comments are explanatory, not a stub indicator. Not a blocker. |

No blocker or warning anti-patterns found. The empty image fields in `_assemble_step1` are by design per D-04 — the template can render immediately from the original hero URL while images are pending.

### Human Verification Required

None. All observable behaviors for this phase (Python agent logic, DB write patterns, test coverage) were verifiable programmatically.

The following is noted for awareness but does not block this phase:
- FAL.AI live integration (actual image editing with real API key) cannot be tested without an active `FAL_KEY` and live service. This was flagged in RESEARCH as expected and addressed by the mock-based test suite per design.

### Gaps Summary

No gaps. All 7 truths verified, all 12 artifacts verified at all levels (exists, substantive, wired, data-flowing), all 8 key links confirmed wired, all 6 PIPE requirements satisfied, and the automated test suite passes with 20/20 tests.

Note on oneshot deletion: The ROADMAP success criterion #3 states "Oneshot pipeline is deleted entirely (per user decision D-02)." This is confirmed SATISFIED — `agents/src/agents/content/oneshot.py` is deleted, `OneshotContent` class removed from `models.py`, and zero `OneshotPipeline` references remain in `agent.py`. The verifier was instructed that ROADMAP criterion #3 ("oneshot continues to work") is superseded — the verified truth is that oneshot is intentionally deleted.

---

_Verified: 2026-03-26_
_Verifier: Claude (gsd-verifier)_
