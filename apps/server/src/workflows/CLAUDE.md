# workflows — Workflow Engine

Seller management workflow automation. NestJS-based execution engine + node catalog.

## Execution Flow

1. `POST /api/workflows/:id/run` (body: `{ context: { productId? } }`)
2. Create WorkflowRun (pending) → fire-and-forget execution
3. DAG traversal: execute each node's executor → record steps
4. After completion: automatic AI analysis once (`runAnalysisAndRecord`)
5. Create ActivityEvent (AI summary + recommended actions)

Batch: `POST /api/workflows/batch-run` → individual workflows run with `skipAnalysis: true` → single consolidated AI analysis at the end.

## Executor Rules

### Naming

```
{category}.{action}            — data.filter, trigger.manual
{category}.{domain}.{action}   — coupang.orders.fetch, naver.reviews.fetch
```

### Registration

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

### Standard Entities (Required)

External API responses **must** be converted to standard types in `executors/types.ts`. Never put raw external keys directly in output.

`StandardOrder`, `StandardProduct`, `StandardInventory`, `StandardAd`, `StandardProfitLoss`, `StandardReview`, `StandardThumbnail`

### Auto-Injected Config Fields

Injected by the engine — executors must not set these. Read only.

- `company_id` — current company ID
- `_context` — execution context (productId, etc.)

### Output Shape

| Pattern | Shape |
|---|---|
| Array data | `{ rows: T[], count: number }` |
| Platform data | `{ orders: StandardOrder[], count: number }` |
| Single action | `{ success: boolean, ... }` |
| Classification | `{ items: T[], overThreshold: T[], underThreshold: T[] }` |

Output key names must match `outputSchema` in `catalog.ts`.

### Error Handling

- `throw` → engine catches it, records in `workflow_step_runs.error`, halts workflow.
- Error messages in **Korean**, understandable by end users.
- Never swallow errors inside executors. No retry logic.

### Adding a New Executor

```
types.ts (check/add standard types)
  → catalog.ts (add NodeDefinition)
    → implement executor (builtin.ts or executors/{category}.ts)
      → registerNode() call
        → sync frontend nodeRegistry
```

## Action Execution

별도 `actions/` catalog 모듈은 없다. 현재 실행 표면은 `executors/builtin.ts`
의 `action` executor 와 workflow API/controller 가 소유한다.

- 새 user-executable action 을 추가할 때는 executor output contract 와 frontend handler/API 호출자를 함께 고정한다.
- catalog 기반 LLM action 선택을 되살릴 경우, 먼저 consumer contract/test 를 만든 뒤 catalog 파일을 복원한다.

## Data Flow

`context.ts` provides `{{nodes.X.output.Y}}` template for inter-node data references.
