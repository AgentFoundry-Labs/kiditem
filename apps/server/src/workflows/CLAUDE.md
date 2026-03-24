# workflows — 워크플로우 엔진

셀러 관리 특화 워크플로우 자동화. NestJS 기반 실행 엔진 + 노드 카탈로그.

## 구조

```
workflows/
├── dag.ts                    — ReactFlow JSON → DAG (스택 기반 실행)
├── context.ts                — 노드 간 데이터 플로우 + {{nodes.X.output.Y}} 템플릿
├── workflow-runner.service.ts — 실행 엔진 (DAG 순회, 스텝 기록, AI 분석)
├── workflows.service.ts       — CRUD + 실행 트리거 (fire-and-forget)
├── workflows.controller.ts   — REST API
├── workflows.module.ts        — NestJS 모듈
├── executors/
│   ├── index.ts              — 레지스트리 (executor + definition)
│   ├── types.ts              — 표준 엔티티 타입 + NodeDefinition
│   ├── catalog.ts            — 30개 노드 정의 (입출력 스키마)
│   ├── builtin.ts            — 내장 executor 구현
│   └── ai-analyze.ts         — Gemini AI 분석 executor
└── actions/
    ├── types.ts              — ActionDefinition 타입
    └── catalog.ts            — 전체 액션 목록 + getActionsForPrompt()
```

## API

| Method | Path | 설명 |
|---|---|---|
| POST | /api/workflows | 생성 |
| GET | /api/workflows | 목록 (companyId, module 필터) |
| GET | /api/workflows/:id | 상세 |
| PUT | /api/workflows/:id | 수정 (version 자동 증가) |
| DELETE | /api/workflows/:id | 삭제 |
| POST | /api/workflows/batch-run | 배치 실행 (여러 워크플로우 → 종합 AI 분석) |
| POST | /api/workflows/:id/run | 단일 실행 (context에 productId 전달 가능) |
| GET | /api/workflows/:id/runs | 실행 이력 |
| GET | /api/workflow-runs/:runId | 실행 상세 + 스텝 목록 |

## 실행 흐름

1. `POST /api/workflows/:id/run` (body: `{ context: { productId? } }`)
2. WorkflowRun 생성 (pending) → fire-and-forget 실행
3. DAG 순회: 노드별 executor 실행 → 스텝 기록
4. 완료 후 자동 AI 분석 1회 (`runAnalysisAndRecord`)
5. ActivityEvent 생성 (AI 요약 + 추천 액션)

배치: 개별 워크플로우는 `skipAnalysis: true`로 실행 → 마지막에 전체 결과 종합 AI 분석 1회.

## Executor 규칙

### 네이밍

```
{category}.{action}            — data.filter, trigger.manual
{category}.{domain}.{action}   — coupang.orders.fetch, naver.reviews.fetch
```

### 등록

```typescript
import { registerNode } from './index';
import { NODE_CATALOG_MAP } from './catalog';

registerNode(
  'coupang.orders.fetch',
  async (prisma, config, context) => {
    const orders: StandardOrder[] = rawOrders.map(toStandardOrder);
    return { orders, count: orders.length };
  },
  NODE_CATALOG_MAP.get('coupang.orders.fetch'),
);
```

### 표준 엔티티 (필수)

외부 API 응답은 **반드시** 표준 타입으로 변환. 원본 키 그대로 output에 넣으면 안 됨.

| 타입 | 용도 |
|---|---|
| `StandardOrder` | 주문 (쿠팡, 네이버 공통) |
| `StandardProduct` | 상품 |
| `StandardInventory` | 재고 |
| `StandardAd` | 광고 실적 |
| `StandardProfitLoss` | 손익 |
| `StandardReview` | 리뷰 |
| `StandardThumbnail` | 썸네일/CTR |

### config 자동 주입 필드

엔진이 주입하므로 executor가 직접 세팅하지 말 것. 읽기만.

- `company_id` — 현재 회사 ID
- `_context` — 실행 컨텍스트 (productId 등). `internal.db_query`에서 자동 필터링에 사용.

### output 형태

| 패턴 | 형태 |
|---|---|
| 배열 데이터 | `{ rows: T[], count: number }` |
| 플랫폼 데이터 | `{ orders: StandardOrder[], count: number }` |
| 단일 액션 | `{ success: boolean, ... }` |
| 분류 결과 | `{ items: T[], overThreshold: T[], underThreshold: T[] }` |

output 키 이름은 `catalog.ts`의 `outputSchema`와 일치해야 함.

### 에러 처리

- `throw`하면 엔진이 잡아서 `workflow_step_runs.error`에 기록하고 워크플로우 중단.
- 에러 메시지는 **한국어**로, 사용자가 원인을 이해할 수 있게.
- executor 내부에서 에러 삼키지 말 것.
- 재시도 로직 없음. throw → 기록 → 중단.

### 새 executor 추가 순서

```
types.ts (표준 타입 확인/추가)
  → catalog.ts (NodeDefinition 추가)
    → executor 구현 (builtin.ts 또는 executors/{category}.ts)
      → registerNode() 호출
        → 프론트 nodeRegistry 동기화
```

## 액션 카탈로그

`actions/catalog.ts`에 사용자가 실행할 수 있는 모든 액션을 정의.

```
actions/
├── types.ts     — ActionDefinition, ActionCondition 타입
└── catalog.ts   — 전체 액션 목록 + getActionsForPrompt()
```

- `ai.analyze` executor가 LLM 프롬프트에 액션 카탈로그를 동적으로 주입
- LLM은 카탈로그에 있는 `type`만 사용하여 structured JSON 반환
- 프론트엔드는 `type`별로 실행 방법을 알고 있음 (navigate, api_call, workflow)
- 새 액션 추가: `actions/catalog.ts`에 정의 → LLM이 자동으로 인지 → 프론트 `handleAction`에 실행 로직 추가
