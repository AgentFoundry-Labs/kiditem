# Phase 02: Python Agent Split - Research

**Researched:** 2026-03-26
**Domain:** Python asyncpg agents / FAL.AI image editing / two-step pipeline refactor
**Confidence:** HIGH (primary decisions are code surgery on owned files, not external API discovery)

## Summary

Phase 2 refactors the monolithic `ContentAgent` into a two-step pipeline. Step 1 (`generation_mode='draft'`) generates Korean copywriting and theme colors only, writing output to `products.draft_content`. Step 2 (`generation_mode='image'`) consumes a user-confirmed snapshot from `agent_tasks.input`, runs FAL.AI image edits for banner/main/detail/size-chart, and writes to `products.processed_data`. The oneshot pipeline (`oneshot.py`, `OneshotPipeline`, `GenerationMode.ONESHOT`) is deleted entirely with no backward compatibility.

The existing code split point is already natural: `TemplatePipeline.process()` contains two sequential `asyncio.gather()` calls. Step 1 uses the first gather (content + size chart OCR), Step 2 uses the second gather (4 FAL.AI image edits). The `_assemble()` method needs a partial variant for Step 1 (text fields + original image URLs, no processed images) and retains the full variant for Step 2.

A critical infrastructure gap was discovered during research: `AIClient.fal_edit_image()` and `AIClient.edit_images_multi()` are called in `template_pipeline.py` but are **not implemented** in `ai_client.py`. These methods must be implemented in Phase 2. The `FAL_KEY` environment variable already exists in `.env` and `.env.example`, confirming FAL.AI integration was planned but the `ai_client.py` side is incomplete.

**Primary recommendation:** Implement the pipeline split by extracting `_run_step1()` and `_run_step2()` methods directly on `TemplatePipeline`, route via `ContentAgent.execute()` on `generation_mode`, implement the two missing `AIClient` methods (`fal_edit_image`, `edit_images_multi`), delete `oneshot.py` and `OneshotPipeline`, and update `GenerationMode` enum to `DRAFT` / `IMAGE`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Reuse existing `content` agent_type. Extend `generation_mode` parameter: `draft` (Step 1: text+colors), `image` (Step 2: FAL.AI image gen). Remove `template` and `oneshot` modes.
- **D-02:** Oneshot pipeline is fully deleted — both code (`oneshot.py`) and routing in `ContentAgent.execute()`. No backward compatibility needed.
- **D-03:** Runner.py's AGENTS dict stays unchanged (`"content": ContentAgent()`). The routing happens inside `ContentAgent.execute()` via `generation_mode`.
- **D-04:** (Claude's Discretion) Choose the most practical data shape. Recommendation: DetailPageData-compatible shape with original image URLs (from raw_data) so templates can render immediately without conversion. Include `heroImageUrl` as an additional field.
- **D-05:** Step 1 writes to `draft_content` column (not `processed_data`). Sets `pipeline_step = 'content_ready'`, `status = 'draft'`.
- **D-06:** agent_tasks.input for Step 2 carries the FULL draftContent snapshot (user's confirmed edits). Step 2 reads hero_image_url and text content from this snapshot, NOT from the live DB row.
- **D-07:** Step 1 keeps: `_generate_korean_content()`, `_scan_size_charts()`. Removes: `_analyze_product()`.
- **D-08:** Step 2 keeps: `_edit_hero_banner()`, `_edit_main_image()`, `_edit_detail_images()`, `_edit_size_charts()`. All use the user-confirmed hero_image_url from the snapshot.
- **D-09:** Step 2 output goes to `processed_data` column. Sets `pipeline_step = null`, `status = 'draft'`.
- **D-10:** Step 1: `status='processing'` → complete → `status='draft', pipeline_step='content_ready'`
- **D-11:** Step 2: `status='processing', pipeline_step='images_generating'` → complete → `status='draft', pipeline_step=null`

### Claude's Discretion

- Code structure: whether to create new pipeline classes or modify TemplatePipeline
- `_assemble()` logic for Step 1 (partial assembly without images) vs Step 2 (full assembly)
- Error handling and status rollback patterns

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | AI 재가공 시 콘텐츠만 생성 (한국어 카피 + 테마 컬러), 이미지 생성 없음 | Step 1 extracts `_generate_korean_content()` + `_scan_size_charts()` gather, writes to `draft_content` |
| PIPE-02 | 에디터 확정 후 이미지 생성을 별도 트리거 가능 | Step 2 triggered by separate `agent_tasks` insert with `generation_mode='image'` |
| PIPE-03 | 이미지 생성 시 사용자 선택 히어로 이미지 1장으로 배너/메인/디테일 전부 생성 | Step 2 reads `heroImageUrl` from snapshot, passes to all four FAL.AI edit methods |
| PIPE-04 | 기존 이미지 분류(_analyze_product) 호출 제거, 히어로 기반 전환 | Remove `_analyze_product()` call from first gather; remove from `PipelineBase` (or leave dormant) |
| PIPE-05 | 사이즈 차트 OCR 감지 유지 | `_scan_size_charts()` stays in Step 1 gather; `size_indices` stored in `draftContent` for Step 2 to use |
| PIPE-06 | agent_tasks.input에 확정된 데이터 스냅샷 저장으로 race condition 방지 | Step 2 reads hero_image_url and all text fields from `task_input['draftContent']`, never from live DB |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| asyncpg | >=0.30.0 | Raw PostgreSQL async driver | Project rule — no ORM |
| pydantic | >=2.0.0 | Data model validation and serialization | Already used for all models |
| httpx | >=0.27.0 | Async HTTP for image downloads | Already used project-wide |
| structlog | (existing) | Structured logging | Already used project-wide |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fal-client | latest | FAL.AI Python SDK for image editing | Required to implement `fal_edit_image()` |
| pytest | >=8.0 | Test runner | Not yet installed in agents venv — Wave 0 gap |
| pytest-asyncio | >=0.24 | Async test support for asyncpg/agent tests | Required for async `execute()` tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fal-client SDK | Direct httpx POST to FAL.AI REST | SDK handles auth, retries, and result polling automatically; prefer SDK |
| Separate Step1Pipeline / Step2Pipeline classes | Methods on TemplatePipeline | Fewer files, cleaner — keep on TemplatePipeline since data model is identical |

**Installation (agents venv):**
```bash
cd agents
.venv/bin/pip install fal-client pytest pytest-asyncio
```

**Version verification:**
```bash
.venv/bin/pip show fal-client pytest pytest-asyncio
```

---

## Architecture Patterns

### Recommended Code Structure After This Phase

```
agents/src/agents/content/
├── agent.py              # ContentAgent — routes on generation_mode
├── template_pipeline.py  # TemplatePipeline — _run_step1(), _run_step2()
├── pipeline_base.py      # PipelineBase — _scan_size_charts() (keep), _analyze_product() (DELETE method)
├── models.py             # GenerationMode: DRAFT='draft', IMAGE='image' (remove TEMPLATE, ONESHOT)
├── paths.py              # Unchanged
└── http_utils.py         # Unchanged
# oneshot.py — DELETED
```

### Pattern 1: generation_mode Routing in ContentAgent.execute()

**What:** `ContentAgent.execute()` reads `task_input['generation_mode']` and calls either `pipeline.run_step1()` or `pipeline.run_step2()`.
**When to use:** All new `content` agent tasks must include `generation_mode` in their input.

```python
# agents/src/agents/content/agent.py — after refactor
generation_mode = (
    task_input.get("generation_mode") or task_input.get("generationMode")
)
if generation_mode not in ("draft", "image"):
    raise ValueError(f"Unknown generation_mode: {generation_mode!r}")

pipeline = TemplatePipeline()

if generation_mode == "draft":
    draft_data = await pipeline.run_step1(ext_data, product_id=str(product_id))
    draft_json = json.dumps(draft_data.model_dump(mode="json"), ensure_ascii=False)
    await pool.execute(
        "UPDATE products SET draft_content=$1::jsonb, status='draft', pipeline_step='content_ready', updated_at=NOW() WHERE id=$2",
        draft_json, product_id
    )
else:  # generation_mode == "image"
    draft_snapshot = task_input.get("draftContent") or task_input.get("draft_content")
    if not draft_snapshot:
        raise ValueError("draftContent snapshot required in task_input for image mode")
    await pool.execute(
        "UPDATE products SET status='processing', pipeline_step='images_generating', updated_at=NOW() WHERE id=$1",
        product_id
    )
    page_data = await pipeline.run_step2(draft_snapshot, product_id=str(product_id))
    processed_json = json.dumps(page_data.model_dump(mode="json"), ensure_ascii=False)
    await pool.execute(
        "UPDATE products SET processed_data=$1::jsonb, status='draft', pipeline_step=NULL, updated_at=NOW() WHERE id=$2",
        processed_json, product_id
    )
```

### Pattern 2: Step 1 Output Shape (draftContent)

**What:** Step 1 produces a `DetailPageData`-compatible dict with all text/color fields populated and `images` field containing original URLs from `ext_data.images`.
**When to use:** This shape is written to `products.draft_content`. The editor reads it to render a preview.

Key: `size_chart_indices` must be preserved so Step 2 knows which `description_images` indices to process.

```python
# Step 1 _assemble (partial — no processed images)
DetailPageData(
    title=content.title_ko,
    images=list(ext_data.images[:1]),        # original hero URL for preview
    hero_banner="",                           # empty — not yet generated
    detail_images=[],                         # empty — not yet generated
    size_images=[],                           # empty — not yet generated
    # ... all text/color fields from content ...
    debug_info={
        "pipeline": "template-step1",
        "size_chart_indices": size_indices,   # CRITICAL — needed by Step 2
        "original_images": list(ext_data.images),  # full image list for hero selection
    }
)
```

### Pattern 3: Step 2 Input — Reading from Snapshot

**What:** Step 2 reads ALL inputs from the frozen snapshot in `task_input['draftContent']`, never queries live DB for content.
**When to use:** Prevents race condition if user edits between task creation and execution (D-06).

```python
# Step 2 — reconstruct needed fields from snapshot
hero_image_url = draft_snapshot.get("heroImageUrl") or draft_snapshot["images"][0]
size_indices = draft_snapshot.get("debug_info", {}).get("size_chart_indices", [])
original_images = draft_snapshot.get("debug_info", {}).get("original_images", [])
size_urls = [original_images[i] for i in size_indices if i < len(original_images)]
# All 4 FAL.AI operations use hero_image_url, NOT ext_data.images[0]
```

### Pattern 4: FAL.AI Client Usage (CRITICAL — Missing Implementation)

**What:** `AIClient.fal_edit_image()` and `AIClient.edit_images_multi()` are called but NOT implemented. Must be added to `ai_client.py`.

The `FAL_KEY` env var exists. `AI_IMAGE_EDIT_MODEL` = `fal-ai/flux-2-pro/edit`. The fal-client SDK handles authentication via `FAL_KEY` env var automatically.

```python
# Add to config.py
FAL_KEY = os.getenv("FAL_KEY", "")

# Add to ai_client.py
import fal_client

async def fal_edit_image(
    self,
    image_url: str,
    prompt: str,
    model: str = "",
    image_size: dict | None = None,
) -> str:
    """Submit image to FAL.AI for editing; return URL of result."""
    if not model:
        raise ValueError("model required for fal_edit_image()")
    kwargs: dict = {
        "image_url": image_url,
        "prompt": prompt,
    }
    if image_size:
        kwargs["image_size"] = image_size

    result = await fal_client.run_async(model, arguments=kwargs)
    # FAL.AI result format varies by model — verify shape in integration test
    images = result.get("images") or []
    if not images:
        raise ValueError(f"FAL.AI returned no images for model {model}")
    return images[0]["url"]

async def edit_images_multi(
    self,
    image_urls: list[str],
    prompt: str,
    model: str = "",
) -> bytes:
    """Multi-image edit via Gemini proxy (size chart OCR editing)."""
    # This uses the existing Gemini proxy path, not FAL.AI
    # Downloads images, sends as inline data, returns bytes
    ...
```

**NOTE:** The exact FAL.AI result JSON shape for `fal-ai/flux-2-pro/edit` must be verified against live API. The `images[0]["url"]` path is the typical convention but needs an integration test run.

### Anti-Patterns to Avoid

- **Reading live DB in Step 2 for content:** Step 2 must use `task_input['draftContent']` snapshot only (D-06). Do not re-query `products` for text/color fields.
- **Calling `_analyze_product()` anywhere in new code:** This method is removed. Do not route to it even as a fallback.
- **Writing to `processed_data` in Step 1:** Step 1 writes exclusively to `draft_content` (D-05). Hard separation per STATE.md decisions.
- **Using `generation_mode='template'` in new tasks:** Old value — NestJS callers must be updated to use `'draft'` or `'image'`.
- **Silent model fallback:** `model = model or default` pattern is forbidden per CLAUDE.md. Raise ValueError if model is empty.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FAL.AI image submission + polling | Custom httpx POST loop | `fal-client` Python SDK | SDK handles auth, async result polling, retries, and error normalization |
| Async test fixtures | Custom pool mock | `pytest-asyncio` + `pytest` fixtures | Standard pattern; asyncpg pool mocking is well-trodden |
| JSON snapshot serialization | Custom serializer | `pydantic model.model_dump(mode="json")` | Already used for `processed_data`; same pattern for `draft_content` |

**Key insight:** The FAL.AI client SDK abstracts away the submit→poll loop that is easy to get wrong (timeout, result URL expiry, 429 backoff). Hand-rolling this is the most likely source of flakiness.

---

## Runtime State Inventory

> This is a refactor phase — runtime state must be explicitly checked.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `products.pipeline_step` and `products.draft_content` columns — schema added in Phase 1, no existing rows with non-null pipeline_step in production yet | None — columns exist, null is correct sentinel for pre-Phase-2 rows |
| Live service config | `agent_tasks` rows with `generation_mode='template'` or `generation_mode='oneshot'` — any pending tasks in the queue would fail after refactor | Verify no pending `content` tasks exist before deploying; runner should drain before restart |
| OS-registered state | None — runner is docker/local process, no OS-level registration | None |
| Secrets/env vars | `FAL_KEY` — already in `.env` and `.env.example`; `AI_IMAGE_EDIT_MODEL=fal-ai/flux-2-pro/edit` | Add `FAL_KEY` to `config.py` imports (currently read only in `.env`, not imported in `config.py`) |
| Build artifacts | agents/.venv — does not contain `fal-client` or `pytest`; must be installed | `pip install fal-client pytest pytest-asyncio` in agents venv |

**Nothing found in category:** OS-registered state — None (verified: no systemd/launchd/pm2 for this project on darwin).

---

## Common Pitfalls

### Pitfall 1: FAL.AI Result Shape Mismatch
**What goes wrong:** `fal-client` result schema varies by model slug. `fal-ai/flux-2-pro/edit` may return `{"images": [{"url": "...", "content_type": "image/jpeg"}]}` but the exact key path is not confirmed from training data.
**Why it happens:** FAL.AI has many models with inconsistent output schemas. The SDK normalizes some but not all.
**How to avoid:** Run a single integration test against real FAL.AI before wiring the full pipeline. Inspect the raw `result` dict and document the actual path.
**Warning signs:** `KeyError: 'images'` or `IndexError` on first real run.

### Pitfall 2: size_chart_indices Lost Between Steps
**What goes wrong:** Step 1 scans description_images and finds size chart indices. If these are not preserved in `draftContent`, Step 2 cannot know which images to send to `edit_images_multi`.
**Why it happens:** `_scan_size_charts()` returns raw index positions into `ext_data.description_images`. If Step 1's output shape doesn't carry both the size URL list AND the original image list, Step 2 is blind.
**How to avoid:** Store `size_chart_indices` (or pre-resolved `size_chart_urls` + `original_images`) in `draftContent.debug_info` or as a top-level field. The debug_info approach avoids polluting the public schema.
**Warning signs:** Step 2 produces no size chart images even when product has measurement diagrams.

### Pitfall 3: gen_mode='template' Tasks in Queue During Deployment
**What goes wrong:** If any `agent_tasks` rows exist with `generation_mode='template'` in pending state, they will hit the refactored `ContentAgent` which raises `ValueError("Unknown generation_mode: 'template'")`, causing the task to fail permanently.
**Why it happens:** Old generation_mode values become invalid after the enum rename.
**How to avoid:** Before deploying, run `SELECT COUNT(*) FROM agent_tasks WHERE agent_type='content' AND status='pending'` and cancel any pending tasks.
**Warning signs:** Immediate failure of existing queued content tasks after deployment.

### Pitfall 4: Missing fal_edit_image in AIClient
**What goes wrong:** `TemplatePipeline._fal_edit()` currently calls `self._ai.fal_edit_image()` which does not exist in `AIClient`. The code will raise `AttributeError` on any Step 2 execution.
**Why it happens:** The method was designed but never implemented — it's a stub call in the pipeline with no backing implementation.
**How to avoid:** Implement `fal_edit_image()` and `edit_images_multi()` in `AIClient` as Wave 0 or Wave 1 tasks before any pipeline execution test.
**Warning signs:** `AttributeError: 'AIClient' object has no attribute 'fal_edit_image'` on first Step 2 run.

### Pitfall 5: edit_images_multi vs fal_edit_image Confusion
**What goes wrong:** `_edit_size_charts()` calls `self._ai.edit_images_multi()` with `model=AI_IMAGE_EDIT_SIZE_MODEL` (`gemini-3.1-flash-image-preview`). This is a DIFFERENT code path from `_fal_edit()` — it uses the Gemini proxy, not FAL.AI. The two methods must be implemented on different backends.
**Why it happens:** Two different models are used: FAL.AI for per-image edits, Gemini for multi-image composite (size chart collage).
**How to avoid:** `fal_edit_image()` → fal-client SDK. `edit_images_multi()` → existing Gemini proxy path (`_proxy_gemini_request` with multiple inline images), returns `bytes` not a URL.
**Warning signs:** Passing a Gemini model slug to the fal-client SDK call (will error).

### Pitfall 6: detail_images All from Hero in Step 2
**What goes wrong:** Current `TemplatePipeline.process()` uses `detail_indices` from `_analyze_product()` to select detail source images. After removing `_analyze_product()`, detail images must come exclusively from the user-confirmed hero image (D-08, CONTEXT specifics note).
**Why it happens:** Old code selected 2–3 different product images for detail shots. New design uses the single hero for all detail shots.
**How to avoid:** In Step 2, call `_edit_detail_images([hero_image_url, hero_image_url, hero_image_url])` — repeating the hero URL is correct because FAL.AI applies different framing/crop per invocation. Do not attempt to reuse other product images.
**Warning signs:** Detail images showing product angles the user did not select as hero.

---

## Code Examples

### Step 1 DB Write Pattern
```python
# Source: existing ContentAgent.execute() + D-05/D-10
draft_json = json.dumps(draft_data.model_dump(mode="json"), ensure_ascii=False)
await pool.execute(
    """
    UPDATE products
    SET draft_content = $1::jsonb,
        status = 'draft',
        pipeline_step = 'content_ready',
        updated_at = NOW()
    WHERE id = $2
    """,
    draft_json,
    product_id,
)
```

### Step 2 DB Write Pattern
```python
# Source: existing agent.py processed_data pattern + D-09/D-11
processed_json = json.dumps(page_data.model_dump(mode="json"), ensure_ascii=False)
await pool.execute(
    """
    UPDATE products
    SET processed_data = $1::jsonb,
        status = 'draft',
        pipeline_step = NULL,
        updated_at = NOW()
    WHERE id = $2
    """,
    processed_json,
    product_id,
)
```

### Error Rollback — Step 1
```python
# On exception: revert to null/draft state (no partial content)
await pool.execute(
    "UPDATE products SET status='draft', pipeline_step=NULL, updated_at=NOW() WHERE id=$1",
    product_id,
)
```

### Error Rollback — Step 2
```python
# On exception: revert to content_ready (Step 1 output preserved)
await pool.execute(
    "UPDATE products SET status='draft', pipeline_step='content_ready', updated_at=NOW() WHERE id=$1",
    product_id,
)
```

### GenerationMode Enum Update
```python
# agents/src/agents/content/models.py
class GenerationMode(enum.StrEnum):
    DRAFT = "draft"     # was TEMPLATE = "template"
    IMAGE = "image"     # new
    # TEMPLATE = "template" — DELETE
    # ONESHOT = "oneshot" — DELETE
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `TemplatePipeline.process()` (text + images together) | Step 1 (`draft`) + Step 2 (`image`) separately triggered | Phase 2 | Enables editor between steps |
| `_analyze_product()` Gemini call for detail_indices | Hero-based: user selects hero, all images derive from it | Phase 2 | -1 Gemini API call, -~20s per product |
| `GenerationMode.TEMPLATE = 'template'` | `GenerationMode.DRAFT = 'draft'` | Phase 2 | NestJS callers must send `'draft'` not `'template'` |
| Oneshot pipeline alongside template | Oneshot deleted entirely | Phase 2 | Simplifies codebase, no backward compat needed |

**Deprecated/outdated:**
- `OneshotPipeline`: delete `agents/src/agents/content/oneshot.py`
- `OneshotContent` model: delete from `models.py`
- `GenerationMode.TEMPLATE` and `GenerationMode.ONESHOT`: replace with `DRAFT` and `IMAGE`
- `_analyze_product()` in `PipelineBase`: remove method body (or delete if not referenced elsewhere)
- `reference_image_url` parameter in `ContentAgent.execute()`: remove (was oneshot-only)

---

## Open Questions

1. **FAL.AI result JSON shape for `fal-ai/flux-2-pro/edit`**
   - What we know: `fal_edit_image()` is called with `image_url`, `prompt`, optional `image_size`. `fal-client` SDK is the right integration point.
   - What's unclear: Exact result dict key path. Likely `result["images"][0]["url"]` but not verified against live API.
   - Recommendation: Create a minimal one-off test script that calls `fal_client.run_async("fal-ai/flux-2-pro/edit", {"image_url": "...", "prompt": "test"})` and prints the result. Document the actual shape before writing the full implementation. This is the spike flagged in STATE.md blockers.

2. **`edit_images_multi` backend confirmation**
   - What we know: Called with `model=AI_IMAGE_EDIT_SIZE_MODEL` (`gemini-3.1-flash-image-preview`). Returns `bytes`. This is the Gemini proxy path, not FAL.AI.
   - What's unclear: Whether the existing `_proxy_gemini_request()` with multi-image `inlineData` parts already works for this, or if there is a separate multi-image edit API endpoint needed.
   - Recommendation: Reuse `edit_image()` approach (inline base64 parts) extended to accept `List[bytes]`. Return bytes of the generated composite image.

3. **PaddleOCR latency in Step 1**
   - What we know: `_scan_size_charts()` uses PaddleOCR to OCR up to 20 images. STATE.md notes "latency not measured — spike recommended."
   - What's unclear: Whether OCR time dominates Step 1 wall time enough to matter UX-wise.
   - Recommendation: Run the pipeline once on a real product and log Step 1 elapsed time. If OCR takes >30s, note it in documentation but do not change the design (PIPE-05 requires keeping it in Step 1).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.11+ (system) | agents runtime | Yes | 3.14.2 | — |
| pytest | Integration tests | No | — | Install via pip (Wave 0 gap) |
| pytest-asyncio | Async agent tests | No | — | Install via pip (Wave 0 gap) |
| fal-client SDK | AIClient.fal_edit_image() | No | — | Install via pip (Wave 0 gap) |
| asyncpg | DB access | Yes (in venv) | >=0.30.0 | — |
| FAL_KEY env var | FAL.AI API calls | Yes (in .env) | — | — |
| AI_IMAGE_EDIT_MODEL | FAL.AI model name | Yes (`fal-ai/flux-2-pro/edit`) | — | — |
| PostgreSQL | Integration tests | Yes (Docker) | — | — |

**Missing dependencies with no fallback:**
- `fal-client` — blocks `AIClient.fal_edit_image()` implementation and Step 2 execution
- `pytest` + `pytest-asyncio` — blocks any test execution

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (not yet installed — Wave 0 gap) |
| Config file | `agents/pytest.ini` — does not exist, Wave 0 creates it |
| Quick run command | `cd agents && .venv/bin/pytest tests/ -x -q` |
| Full suite command | `cd agents && .venv/bin/pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Step 1 writes to `draft_content`, does NOT touch `processed_data` | integration | `pytest tests/test_content_agent.py::test_step1_writes_draft_content -x` | Wave 0 |
| PIPE-01 | Step 1 result shape includes all text/color fields and original image URLs | unit | `pytest tests/test_template_pipeline.py::test_step1_assemble_shape -x` | Wave 0 |
| PIPE-02 | Step 2 is triggered by separate agent_task with `generation_mode='image'` | integration | `pytest tests/test_content_agent.py::test_step2_triggered_by_image_mode -x` | Wave 0 |
| PIPE-03 | Step 2 passes user-confirmed hero_image_url to all 4 FAL.AI edit calls | unit (mock) | `pytest tests/test_template_pipeline.py::test_step2_uses_hero_url -x` | Wave 0 |
| PIPE-04 | `_analyze_product()` is never called in either step | unit | `pytest tests/test_template_pipeline.py::test_analyze_product_removed -x` | Wave 0 |
| PIPE-05 | `_scan_size_charts()` is called in Step 1; size_indices preserved in output | unit | `pytest tests/test_template_pipeline.py::test_size_chart_indices_in_draft -x` | Wave 0 |
| PIPE-06 | Step 2 reads hero_image_url from task_input snapshot, not from DB | unit (mock) | `pytest tests/test_content_agent.py::test_step2_reads_from_snapshot -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd agents && .venv/bin/pytest tests/ -x -q`
- **Per wave merge:** `cd agents && .venv/bin/pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `agents/pytest.ini` — configure `asyncio_mode = auto` for pytest-asyncio
- [ ] `agents/tests/__init__.py` — empty init
- [ ] `agents/tests/conftest.py` — async pool fixture (mock asyncpg pool), mock AIClient
- [ ] `agents/tests/test_content_agent.py` — covers PIPE-01, PIPE-02, PIPE-06
- [ ] `agents/tests/test_template_pipeline.py` — covers PIPE-01 (shape), PIPE-03, PIPE-04, PIPE-05
- [ ] Framework install: `cd agents && .venv/bin/pip install pytest pytest-asyncio fal-client`

---

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Impact on Phase 2 |
|------------|--------|-------------------|
| asyncpg raw SQL only, no ORM | CLAUDE.md / agents/CLAUDE.md | All DB writes in `ContentAgent.execute()` use `pool.execute()` raw SQL |
| Native PG enum forbidden | CLAUDE.md | `GenerationMode` stays a Python `enum.StrEnum`, not a DB enum |
| Agent間 직접 import 금지 | CLAUDE.md | `ContentAgent` must not import from other agent modules |
| Silent model fallback 금지 | CLAUDE.md | `model = model or default` is forbidden; raise ValueError if model is empty |
| `app.` import 금지 | agents/CLAUDE.md | All imports use `src.` prefix |
| Langfuse `@observe` 금지 | agents/CLAUDE.md | No Langfuse decorators anywhere |
| No /v1/ in API routes | CLAUDE.md | Not directly applicable (Python only phase) |
| pipelineStep: nullable String not enum | STATE.md decision | Valid values null/content_ready/images_generating enforced at app level only |
| draftContent → Step 1 exclusive | STATE.md decision | Step 2 NEVER writes to `draft_content` |
| processedData → Step 2 exclusive | STATE.md decision | Step 1 NEVER writes to `processed_data` |

---

## Sources

### Primary (HIGH confidence)
- Direct code reading: `agents/src/agents/content/agent.py` — current routing, status patterns
- Direct code reading: `agents/src/agents/content/template_pipeline.py` — split point at lines 184 and 203
- Direct code reading: `agents/src/agents/content/pipeline_base.py` — `_scan_size_charts()`, `_analyze_product()` implementations
- Direct code reading: `agents/src/core/ai_client.py` — confirmed `fal_edit_image` and `edit_images_multi` are NOT defined (lines 1-359 exhausted)
- Direct code reading: `agents/.env` and `.env.example` — FAL_KEY present, AI_IMAGE_EDIT_MODEL confirmed
- Direct code reading: `prisma/schema.prisma` — Product model with `draft_content`, `pipeline_step` columns confirmed
- Direct code reading: `agents/src/agents/content/models.py` — GenerationMode enum, DetailPageData shape
- Direct code reading: `agents/pyproject.toml` — pytest and fal-client absent from dependencies

### Secondary (MEDIUM confidence)
- `.planning/phases/02-python-agent-split/02-CONTEXT.md` — all D-0X decisions, canonical refs
- `.planning/STATE.md` — confirmed decisions and blockers (FAL.AI shape, PaddleOCR latency)

### Tertiary (LOW confidence)
- FAL.AI result shape for `fal-ai/flux-2-pro/edit` — inferred from typical fal-client SDK conventions; must be verified with live API call

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries identified from existing code, pyproject.toml, and .env files
- Architecture: HIGH — split point exactly identified in template_pipeline.py lines 184/203; all decisions locked in CONTEXT.md
- Pitfalls: HIGH — missing fal_edit_image confirmed by exhaustive ai_client.py read; all other pitfalls from direct code analysis
- FAL.AI result shape: LOW — must be verified with live integration test

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable domain; FAL.AI result shape should be pinned on first integration test)
