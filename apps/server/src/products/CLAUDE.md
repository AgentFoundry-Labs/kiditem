# products — Product / Thumbnail / Pricing 도메인

39 파일. 단순 CRUD 도메인이 아니라 **3단계 썸네일 AI 파이프라인 + pricing 해결자 + Coupang Wing 자동화** 가 얽힌 hub. 컨트롤러 7개 / 서비스 13개 / DTO 21개로 도메인 내부 분할이 깊다.

## Directory

```
products/
├── controllers/         # 7 controllers — 각 라우트 prefix 다름
├── services/            # 13 services + types.ts (서비스 내부 인터페이스)
├── dto/                 # 21 DTO + index.ts
├── __tests__/
└── products.module.ts
```

## Controllers — Route Map

| Controller | Prefix | 책임 |
|---|---|---|
| `products.controller.ts` | `/api/products` | 핵심 CRUD, getPipelineStats, content-draft trigger |
| `thumbnails.controller.ts` | `/api/thumbnails` | 그레이드+메트릭 요약 리스트 |
| `thumbnail-analysis.controller.ts` | `/api/thumbnail-analysis` | 배치 AI 분석 (compliance + quality), cancel, pre-inspect |
| `thumbnail-editor.controller.ts` | `/api/thumbnail-editor` | 편집 잡 생성/리스트/선택 |
| `thumbnail-tracking.controller.ts` | `/api/thumbnail-tracking` | 적용 후 임팩트 추적 (CTR/리뷰/매출 before→after) |
| `product-images.controller.ts` | `/api/products/:id/images` | MinIO/R2 업로드, save-from-url |
| `reviews.controller.ts` | `/api/reviews` | 리뷰 리스트 + product별 집계 |

## 핵심 패턴

### 1. Thumbnail 3-stage Pipeline

`thumbnail-pre-inspect` → `thumbnail-analysis` (Gemini) → `thumbnail-edit` (Gemini) → `thumbnail-generation` (apply to product) → `thumbnail-tracking` (impact 측정).

**Status flow**: `pending → generating → ready → applied`

각 단계는 별도 service. **순서 변경 / 단계 스킵 금지** (테스트 `__tests__/thumbnail-flow.spec.ts` 보호).

### 2. Pricing Resolver Fallback Chain

`resolvePricing()` (in `apps/server/src/common/master-product-resolver.ts`) — chain:
`masterProduct.costPrice → product.costPrice → CNY × 190 환산 → 0`

`products.service.ts:319` 등에서 호출. **product에 직접 costPrice 쓰는 패턴 금지** — 항상 resolver 경유.

### 3. Gemini API 통합 (단일 진입점)

`thumbnail-ai.service.ts` 단독으로 Gemini 호출. 다른 서비스는 이걸 inject해서 씀.

- 모델: 상수 `GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'` (line 15)
- ENV: `process.env.GEMINI_API_KEY` (없으면 onModuleInit에서 warn + rule-based fallback)
- 두 가지 prompt: `COMPLIANCE_PROMPT` (12-item 가이드라인 체크), `QUALITY_PROMPT` (5-dim CTR 평가)
- AbortController로 배치 cancel 지원

**다른 도메인에서 Gemini 직접 호출 금지** — `thumbnail-ai.service` 또는 `server/ai/` 모듈 경유.

### 4. $transaction — Atomic Compound 생성

`createCompound()` (products.service.ts:402) 만 사용:

```typescript
$transaction(async tx => {
  const masterProduct = await tx.masterProduct.create(...);
  const product = await tx.product.create({ masterProductId: masterProduct.id });
  await tx.inventory.create({ productId: product.id });
});
```

**그 외 곳에서 $transaction 금지** — single mutation 으로 충분.

### 5. AgentRegistry trigger (content-draft)

`products.service.ts:509` (full 모드), `:637` (image-only 모드):
```typescript
agentRegistry.runByType('content', { extra: { productId, generation_mode: 'full'|'image' } });
```

**content/copy 생성은 직접 LLM 호출 금지** — 항상 AgentRegistry 경유.

### 6. satisfies + as const 강제

응답 shape 보호:
- `} satisfies ThumbnailListItem` (thumbnails.service.ts:116, :172)
- `} satisfies ThumbnailSummary` (thumbnail-analysis.service.ts:235)

Prisma select 객체:
- `const PRODUCT_SELECT = { id: true, ... } as const` (thumbnail-edit.service.ts:7)

## 외부 의존

- **Gemini API** — `thumbnail-ai.service.ts` 만
- **StorageService** (from `common/`) — image 업로드, path: `product-images/{productId}/{uuid}.{ext}`
- **AgentRegistry** (from `agent-registry/`) — content/image 생성 트리거
- **Coupang Wing 자동화** — `thumbnail-wing.service.ts` 가 Python/Puppeteer subprocess spawn

## DTO 패턴

- 분리: 모든 DTO는 `dto/{operation}.dto.ts` 단독 파일 (inline 금지)
- export: `dto/index.ts` 에서 barrel
- 명명: `<Verb><Noun><Body|Query>Dto` (예: `CreateProductBodyDto`, `ListProductsQueryDto`)
- 숫자 변환: `@Type(() => Number)` (string → number 자동)
- companyId는 DTO에 **포함 금지** — 컨트롤러에서 `@CurrentCompany()` 로 주입 (ADR-0006)

## 금지 (Hard bans)

- ❌ Thumbnail 파이프라인 단계 스킵 또는 순서 변경
- ❌ Pricing 직접 계산 (resolvePricing 경유 필수)
- ❌ Gemini 직접 호출 (thumbnail-ai.service 또는 ai/ 경유)
- ❌ Content/copy 직접 LLM 호출 (AgentRegistry 경유)
- ❌ DTO에 companyId 포함
- ❌ `$transaction` 새로 추가 (createCompound 만 정당화됨)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| `thumbnail-ai.service.ts` (모델 변경 등) | `__tests__/thumbnail-flow.spec.ts`, `thumbnail-analysis.service.ts` (호출자) |
| Pricing 계산 | `common/master-product-resolver.ts`, `products.service.ts:319` |
| `products.service.ts createCompound` | `__tests__/products.service.spec.ts`, `prisma/schema.prisma` (Master*+Product+Inventory 관계) |
| AgentRegistry trigger 변경 | `agent-registry/agent-registry.service.ts`, `agent-config/prompts/agents/content.md` |
| Image 업로드 경로 | `common/storage/storage.service.ts`, `product-images.controller.ts`, MinIO 버킷 정책 |
| Thumbnail Wing 자동화 | `thumbnail-wing.service.ts`, Python/Puppeteer 스크립트 |
