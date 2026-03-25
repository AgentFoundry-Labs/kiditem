---
phase: 02-python-agent-split
plan: "03"
subsystem: agents/tests
tags: [testing, pytest, pipeline, content-agent]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [automated-pipe-coverage]
  affects: [agents/tests]
tech_stack:
  added: [pytest==9.0.2, pytest-asyncio==1.3.0]
  patterns: [asyncio_mode=auto, AsyncMock boundary mocking, fixture-based test isolation]
key_files:
  created:
    - agents/pytest.ini
    - agents/tests/__init__.py
    - agents/tests/conftest.py
    - agents/tests/test_content_agent.py
    - agents/tests/test_template_pipeline.py
  modified: []
decisions:
  - "Mocked AIClient at pipeline_base.AIClient (not at template_pipeline) since PipelineBase.__init__ assigns self._ai = AIClient()"
  - "Patched product_images_dir in step2 tests to avoid filesystem creation for size chart write"
  - "test_step1_writes_draft_content asserts processed_data NOT in SQL calls — hard separation proven"
metrics:
  duration: "3min"
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_changed: 5
---

# Phase 02 Plan 03: pytest test suite covering PIPE-01 through PIPE-06 Summary

pytest test suite with 20 passing tests verifying all six pipeline split requirements (PIPE-01 through PIPE-06).

## What Was Built

**Task 1: pytest scaffold**
- `agents/pytest.ini` configured with `asyncio_mode = auto` and `testpaths = tests`
- `agents/tests/__init__.py` created
- `agents/tests/conftest.py` with shared fixtures: `mock_pool`, `mock_ai_client`, `sample_draft_content`, `sample_ext_data`, `sample_generated_content`
- pytest 9.0.2 and pytest-asyncio 1.3.0 installed in agents venv

**Task 2: PIPE requirement tests**
- `agents/tests/test_content_agent.py`: 10 tests for ContentAgent routing and DB writes
- `agents/tests/test_template_pipeline.py`: 10 tests for TemplatePipeline step methods

## PIPE Requirement Coverage

| Requirement | Description | Test(s) | Status |
|-------------|-------------|---------|--------|
| PIPE-01 | Step 1 writes to draft_content, NOT processed_data | test_step1_writes_draft_content, test_step1_assemble_shape, test_step1_no_fal_calls | PASS |
| PIPE-02 | Step 2 triggered by generation_mode=image | test_image_mode_calls_step2, test_step2_triggered_by_image_mode | PASS |
| PIPE-03 | Step 2 passes hero_image_url from snapshot to all FAL.AI calls | test_step2_uses_hero_url | PASS |
| PIPE-04 | _analyze_product never called in either step | test_analyze_product_removed, test_step2_no_analyze_product | PASS |
| PIPE-05 | Size chart indices preserved in Step 1 output | test_size_chart_indices_in_draft, test_step2_reads_size_indices_from_snapshot | PASS |
| PIPE-06 | Step 2 reads from task_input snapshot, not live DB | test_step2_reads_from_snapshot, test_step2_requires_snapshot | PASS |

## Test Results

```
20 passed in 0.50s
```

All 20 tests pass. Exit code 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Patched product_images_dir in Step 2 tests**
- **Found during:** Task 2 (test_step2_* tests)
- **Issue:** `_edit_size_charts` calls `product_images_dir()` and writes bytes to disk, making tests dependent on filesystem
- **Fix:** Added `patch("src.agents.content.template_pipeline.product_images_dir")` in Step 2 tests with a real `/tmp/test_kiditem/{product_id}/images` path that is created on the fly
- **Files modified:** agents/tests/test_template_pipeline.py

None other - plan executed as written.

## Known Stubs

None. All tests assert against real behavior of the pipeline code from Plans 01 and 02.

## Self-Check: PASSED

Files created:
- agents/pytest.ini — FOUND
- agents/tests/__init__.py — FOUND
- agents/tests/conftest.py — FOUND
- agents/tests/test_content_agent.py — FOUND
- agents/tests/test_template_pipeline.py — FOUND

Commits:
- fe575ee — FOUND (chore(02-03): add pytest scaffold and fixtures)
- 2cdd602 — FOUND (test(02-03): add PIPE-01 through PIPE-06 test coverage)
