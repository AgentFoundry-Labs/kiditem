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

## Action Catalog

`actions/catalog.ts` defines all user-executable actions.

- `ai.analyze` executor dynamically injects action catalog into LLM prompt
- LLM returns structured JSON using only catalog `type` values
- Adding actions: define in `actions/catalog.ts` → LLM auto-recognizes → add execution logic in frontend `handleAction`

## Data Flow

`context.ts` provides `{{nodes.X.output.Y}}` template for inter-node data references.
