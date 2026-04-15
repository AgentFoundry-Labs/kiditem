# Graph Report - apps/server/src/ai  (2026-04-14)

## Corpus Check
- Corpus is ~1,198 words - fits in a single context window. You may not need a graph.

## Summary
- 49 nodes · 40 edges · 15 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (10n)|Cluster 0 (10n)]]
- [[_COMMUNITY_Cluster 1 (6n)|Cluster 1 (6n)]]
- [[_COMMUNITY_Cluster 2 (4n)|Cluster 2 (4n)]]
- [[_COMMUNITY_Cluster 3 (4n)|Cluster 3 (4n)]]
- [[_COMMUNITY_Cluster 4 (4n)|Cluster 4 (4n)]]
- [[_COMMUNITY_Cluster 5 (4n)|Cluster 5 (4n)]]
- [[_COMMUNITY_Cluster 6 (4n)|Cluster 6 (4n)]]
- [[_COMMUNITY_Cluster 7 (2n)|Cluster 7 (2n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `services/text-ai.service.ts` - 5 edges
2. `Dual-path: Image=Agent / Text=Direct` - 4 edges
3. `Preset → Hardcoded System Prompt 매핑` - 4 edges
4. `Gemini Direct Call (text only)` - 4 edges
5. `ImageAiController` - 3 edges
6. `TextAiController` - 3 edges
7. `ImageAiService` - 3 edges
8. `TextAiService` - 3 edges
9. `mimeFromExt()` - 2 edges
10. `toDataUri()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Gemini Direct Call (text only)` --rationale_for--> `services/text-ai.service.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 6 → community 0_

## Communities

### Community 0 - "Cluster 0 (10n)"
Cohesion: 0.24
Nodes (10): ai.module.ts, services/image-ai.service.ts, services/text-ai.service.ts, dto/text-transform.dto.ts, Dual-path: Image=Agent / Text=Direct, Preset → Hardcoded System Prompt 매핑, Image edit 동기 호출 금지 (agent 위임 강제), Text에 사용자 변수 string concat injection 금지 (prompt 함수형 빌드) (+2 more)

### Community 1 - "Cluster 1 (6n)"
Cohesion: 0.47
Nodes (4): inlineImages(), mimeFromExt(), RenderImageController, toDataUri()

### Community 2 - "Cluster 2 (4n)"
Cohesion: 0.5
Nodes (1): ImageAiController

### Community 3 - "Cluster 3 (4n)"
Cohesion: 0.5
Nodes (1): TextAiController

### Community 4 - "Cluster 4 (4n)"
Cohesion: 0.5
Nodes (1): ImageAiService

### Community 5 - "Cluster 5 (4n)"
Cohesion: 0.67
Nodes (1): TextAiService

### Community 6 - "Cluster 6 (4n)"
Cohesion: 0.5
Nodes (4): Gemini Direct Call (text only), Gemini API 외 다른 모델 직접 호출 금지 (새 LLM 추가 시 ADR), Error 시 API status + truncated response body 노출 (debugging), Text temperature 변경 시 prompt 일관성 검증 필요

### Community 7 - "Cluster 7 (2n)"
Cohesion: 1.0
Nodes (1): AiModule

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): ImageEditBodyDto

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (1): RenderImageBodyDto

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (1): TextTransformBodyDto

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (2): agent-config/prompts/agents/image-edit.md, dto/image-edit.dto.ts

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (1): Image은 무거움/느림 → agent 비동기 큐, text는 빠름 → 동기 OK

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (1): controllers/render-image.controller.ts

## Knowledge Gaps
- **15 isolated node(s):** `AiModule`, `ImageEditBodyDto`, `RenderImageBodyDto`, `TextTransformBodyDto`, `Image은 반드시 agent 위임, text만 직접 호출 허용` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 7 (2n)`** (2 nodes): `AiModule`, `ai.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `image-edit.dto.ts`, `ImageEditBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `render-image.dto.ts`, `RenderImageBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `text-transform.dto.ts`, `TextTransformBodyDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `agent-config/prompts/agents/image-edit.md`, `dto/image-edit.dto.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `Image은 무거움/느림 → agent 비동기 큐, text는 빠름 → 동기 OK`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `controllers/render-image.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `services/text-ai.service.ts` connect `Cluster 0 (10n)` to `Cluster 6 (4n)`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Gemini Direct Call (text only)` connect `Cluster 6 (4n)` to `Cluster 0 (10n)`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `services/text-ai.service.ts` (e.g. with `Dual-path: Image=Agent / Text=Direct` and `Preset → Hardcoded System Prompt 매핑`) actually correct?**
  _`services/text-ai.service.ts` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Dual-path: Image=Agent / Text=Direct` (e.g. with `services/image-ai.service.ts` and `services/text-ai.service.ts`) actually correct?**
  _`Dual-path: Image=Agent / Text=Direct` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Preset → Hardcoded System Prompt 매핑` (e.g. with `services/text-ai.service.ts` and `dto/text-transform.dto.ts`) actually correct?**
  _`Preset → Hardcoded System Prompt 매핑` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AiModule`, `ImageEditBodyDto`, `RenderImageBodyDto` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._