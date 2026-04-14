# Graph Report - agents  (2026-04-14)

## Corpus Check
- Corpus is ~15,013 words - fits in a single context window. You may not need a graph.

## Summary
- 309 nodes · 553 edges · 28 communities detected
- Extraction: 69% EXTRACTED · 31% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (50n)|Cluster 0 (50n)]]
- [[_COMMUNITY_Cluster 1 (48n)|Cluster 1 (48n)]]
- [[_COMMUNITY_Cluster 2 (32n)|Cluster 2 (32n)]]
- [[_COMMUNITY_Cluster 3 (27n)|Cluster 3 (27n)]]
- [[_COMMUNITY_Cluster 4 (26n)|Cluster 4 (26n)]]
- [[_COMMUNITY_Cluster 5 (22n)|Cluster 5 (22n)]]
- [[_COMMUNITY_Cluster 6 (17n)|Cluster 6 (17n)]]
- [[_COMMUNITY_Cluster 7 (17n)|Cluster 7 (17n)]]
- [[_COMMUNITY_Cluster 8 (12n)|Cluster 8 (12n)]]
- [[_COMMUNITY_Cluster 9 (8n)|Cluster 9 (8n)]]
- [[_COMMUNITY_Cluster 10 (6n)|Cluster 10 (6n)]]
- [[_COMMUNITY_Cluster 11 (6n)|Cluster 11 (6n)]]
- [[_COMMUNITY_Cluster 12 (6n)|Cluster 12 (6n)]]
- [[_COMMUNITY_Cluster 13 (5n)|Cluster 13 (5n)]]
- [[_COMMUNITY_Cluster 14 (5n)|Cluster 14 (5n)]]
- [[_COMMUNITY_Cluster 15 (4n)|Cluster 15 (4n)]]
- [[_COMMUNITY_Cluster 16 (3n)|Cluster 16 (3n)]]
- [[_COMMUNITY_Cluster 17 (3n)|Cluster 17 (3n)]]
- [[_COMMUNITY_Cluster 18 (3n)|Cluster 18 (3n)]]
- [[_COMMUNITY_Cluster 19 (1n)|Cluster 19 (1n)]]
- [[_COMMUNITY_Cluster 20 (1n)|Cluster 20 (1n)]]
- [[_COMMUNITY_Cluster 21 (1n)|Cluster 21 (1n)]]
- [[_COMMUNITY_Cluster 22 (1n)|Cluster 22 (1n)]]
- [[_COMMUNITY_Cluster 23 (1n)|Cluster 23 (1n)]]
- [[_COMMUNITY_Cluster 24 (1n)|Cluster 24 (1n)]]
- [[_COMMUNITY_Cluster 25 (1n)|Cluster 25 (1n)]]
- [[_COMMUNITY_Cluster 26 (1n)|Cluster 26 (1n)]]
- [[_COMMUNITY_Cluster 27 (1n)|Cluster 27 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `DetailPageData` - 49 edges
2. `TemplatePipeline` - 34 edges
3. `GeneratedContent` - 28 edges
4. `ContentAgent` - 26 edges
5. `ImageTranslator` - 20 edges
6. `Matcher1688` - 20 edges
7. `ExtensionProductData` - 17 edges
8. `PipelineBase` - 13 edges
9. `AIClient` - 12 edges
10. `AIImageGenerator` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Minimal raw_data for ExtensionProductData validation.` --uses--> `DetailPageData`  [INFERRED]
  tests/conftest.py → src/agents/content/models.py
- `Minimal GeneratedContent for step1 output.` --uses--> `DetailPageData`  [INFERRED]
  tests/conftest.py → src/agents/content/models.py
- `A draft_content snapshot as would be stored in DB / passed to Step 2.` --uses--> `DetailPageData`  [INFERRED]
  tests/conftest.py → src/agents/content/models.py
- `Mock asyncpg pool that returns product data and tracks SQL calls.` --uses--> `DetailPageData`  [INFERRED]
  tests/conftest.py → src/agents/content/models.py
- `Mock AIClient that returns predictable results.` --uses--> `DetailPageData`  [INFERRED]
  tests/conftest.py → src/agents/content/models.py

## Communities

### Community 0 - "Cluster 0 (50n)"
Cohesion: 0.08
Nodes (36): BaseModel, mock_ai_client(), mock_pool(), Mock asyncpg pool that returns product data and tracks SQL calls., Mock AIClient that returns predictable results., Minimal raw_data for ExtensionProductData validation., Minimal GeneratedContent for step1 output., A draft_content snapshot as would be stored in DB / passed to Step 2. (+28 more)

### Community 1 - "Cluster 1 (48n)"
Cohesion: 0.07
Nodes (30): PipelineBase, _detect_provider(), _edit_color_guide(), _edit_detail_images(), _edit_hero_banner(), _edit_main_image(), _edit_size_charts(), _generate_korean_content() (+22 more)

### Community 2 - "Cluster 2 (32n)"
Cohesion: 0.13
Nodes (19): ContentAgent, DetailPageData, Integration tests for ContentAgent routing and DB writes.  Covers: - PIPE-01: St, Test that Step 1 writes to draft_content, not processed_data., PIPE-01: Step 1 SQL writes to draft_content column., D-10: Step 1 success sets pipeline_step = 'content_ready'., Test that Step 2 reads from snapshot, not live DB., PIPE-06: Step 2 passes draftContent snapshot to pipeline.run_step2(). (+11 more)

### Community 3 - "Cluster 3 (27n)"
Cohesion: 0.11
Nodes (18): AIClient, analyze_images_batch(), _detect_text_provider(), _download_images_as_base64(), _download_one(), edit_images_multi(), _extract_gemini_image(), generate() (+10 more)

### Community 4 - "Cluster 4 (26n)"
Cohesion: 0.14
Nodes (7): MatchCandidate, Matcher1688, main(), _match_1688(), Scrape a 1688/Alibaba product URL and return extracted data., Search 1688 via TMAPI for matching products., _scrape_url()

### Community 5 - "Cluster 5 (22n)"
Cohesion: 0.16
Nodes (3): _contains_chinese(), ImageTranslator, TextRegion

### Community 6 - "Cluster 6 (17n)"
Cohesion: 0.15
Nodes (7): ABC, ImageEditAgent, Step 2: Generate images from confirmed snapshot, write to processed_data., Step 1: Generate copywriting + theme colors, write to draft_content., SourcingAgent, BaseAgent, BaseAgent

### Community 7 - "Cluster 7 (17n)"
Cohesion: 0.12
Nodes (17): File: AgentDefinition (DB table), File: agents/.env.example, File: agents/src/agents/{name}.py, File: agents/src/server.py, Pattern: asyncpg Raw SQL DB Access, Pattern: BaseAgent Subclass Registration, Pattern: FastAPI HTTP Server for Python Agents, Pattern: NestJS python_http Adapter Invocation (+9 more)

### Community 8 - "Cluster 8 (12n)"
Cohesion: 0.42
Nodes (2): AIImageGenerator, _load_image_bytes()

### Community 9 - "Cluster 9 (8n)"
Cohesion: 0.36
Nodes (5): _calc_image_cost(), _calc_text_cost(), _match_pricing(), AI cost calculation helpers (standalone, no Langfuse dependency)., _report_image_usage()

### Community 10 - "Cluster 10 (6n)"
Cohesion: 0.33
Nodes (2): FastAPI server for Python agents (content, image_edit). Replaces runner.py DB po, RunRequest

### Community 11 - "Cluster 11 (6n)"
Cohesion: 0.33
Nodes (0): 

### Community 12 - "Cluster 12 (6n)"
Cohesion: 0.73
Nodes (4): execute(), _execute_full(), _execute_step1(), _execute_step2()

### Community 13 - "Cluster 13 (5n)"
Cohesion: 0.5
Nodes (1): PageRenderer

### Community 14 - "Cluster 14 (5n)"
Cohesion: 0.6
Nodes (4): _detect_platform(), _load_extractor_js(), Server-side product scraper using rebrowser-playwright.  Launches a headless bro, scrape_product_url()

### Community 15 - "Cluster 15 (4n)"
Cohesion: 0.67
Nodes (2): download_image(), load_image()

### Community 16 - "Cluster 16 (3n)"
Cohesion: 0.67
Nodes (0): 

### Community 17 - "Cluster 17 (3n)"
Cohesion: 0.67
Nodes (3): File: agents/requirements.txt, Pattern: Langfuse @observe Instrumentation, Rule: Use Langfuse @observe (SDK v4, from langfuse import observe)

### Community 18 - "Cluster 18 (3n)"
Cohesion: 0.67
Nodes (3): Pattern: Agent Communication via DB State Only, Prohibit: No direct imports between agents, Rationale: Agents communicate via DB state to avoid tight coupling

### Community 19 - "Cluster 19 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Cluster 20 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Cluster 21 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Cluster 22 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Cluster 23 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Cluster 24 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Cluster 25 (1n)"
Cohesion: 1.0
Nodes (1): Pattern: HeartbeatRun Safety Pipeline

### Community 26 - "Cluster 26 (1n)"
Cohesion: 1.0
Nodes (1): Pattern: snake_case Table/Column Names (Prisma @@map)

### Community 27 - "Cluster 27 (1n)"
Cohesion: 1.0
Nodes (1): File: agents/CLAUDE.md

## Knowledge Gaps
- **27 isolated node(s):** `AI cost calculation helpers (standalone, no Langfuse dependency).`, `Model provider registry.  Add new providers by appending a ``ModelProvider`` to`, `Return the provider whose prefix matches *model*, or the default.`, `Register a new provider.`, `Submit image to FAL.AI for editing; return URL of result image.` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 19 (1n)`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (1n)`** (1 nodes): `config.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 21 (1n)`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (1n)`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (1n)`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 24 (1n)`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 25 (1n)`** (1 nodes): `Pattern: HeartbeatRun Safety Pipeline`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 26 (1n)`** (1 nodes): `Pattern: snake_case Table/Column Names (Prisma @@map)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 27 (1n)`** (1 nodes): `File: agents/CLAUDE.md`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AIClient` connect `Cluster 3 (27n)` to `Cluster 0 (50n)`, `Cluster 8 (12n)`, `Cluster 5 (22n)`, `Cluster 6 (17n)`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **Why does `PipelineBase` connect `Cluster 0 (50n)` to `Cluster 1 (48n)`, `Cluster 3 (27n)`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Why does `TemplatePipeline` connect `Cluster 1 (48n)` to `Cluster 0 (50n)`, `Cluster 2 (32n)`, `Cluster 6 (17n)`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 47 inferred relationships involving `DetailPageData` (e.g. with `Minimal raw_data for ExtensionProductData validation.` and `Minimal GeneratedContent for step1 output.`) actually correct?**
  _`DetailPageData` has 47 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `TemplatePipeline` (e.g. with `TestStep1` and `TestStep2`) actually correct?**
  _`TemplatePipeline` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `GeneratedContent` (e.g. with `Minimal raw_data for ExtensionProductData validation.` and `Minimal GeneratedContent for step1 output.`) actually correct?**
  _`GeneratedContent` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `ContentAgent` (e.g. with `TestContentAgentRouting` and `TestStep1DBWrites`) actually correct?**
  _`ContentAgent` has 23 INFERRED edges - model-reasoned connections that need verification._