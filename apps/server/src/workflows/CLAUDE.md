# workflows — Workflow Engine (slim core)

Workflow 엔진은 **DAG runner + WorkflowRun 기록 + panel event emitter +
Agent delegation shell** 이다. 범용 자동화/데이터 처리 엔진이 아니다.

## 무엇이 아닌가 (Hard bans)

- ❌ **Workflow 는 generic DB engine 이 아니다** — `prisma.<model>.findMany`
  같은 임의 모델 쿼리를 노드 타입으로 노출하지 않는다 (구 `internal.db_query`
  제거).
- ❌ **Workflow 는 generic HTTP engine 이 아니다** — 임의 URL 로 fetch 하는
  `api_call` 같은 노드는 두지 않는다.
- ❌ **Workflow 는 generic transform engine 이 아니다** — `data.filter` /
  `data_transform` / `action` 처럼 표준 contract 없이 임의 로직을 실행하는
  generic 노드는 두지 않는다.
- ❌ **Workflow executor 는 LLM/Claude/OpenAI/Gemini SDK 를 직접 호출하지
  않는다** — AI 작업은 **반드시** `agent_task.create` 로 `AgentRegistry` 에
  위임한다 (`AgentRegistryService.runByType`). compatibility alias 도 두지
  않는다 — 옛 template 이 `ai_process` 를 가리키면 unknown executor 로 실패
  하고 그 실패가 `WorkflowRun.error` 에 남는다.

## 살아남은 executor (slim core)

`executors/builtin.ts` 의 등록 대상은 5개 뿐이다.

| Node type | 책임 |
|---|---|
| `trigger.manual` | 수동 트리거 진입점. side-effect 없음 |
| `trigger.schedule` | cron 트리거 진입점. side-effect 없음 |
| `condition.evaluate` | 단일 numeric 비교 (`lt/gt/eq/gte/lte`) → branch 분기 |
| `notification.alert` | `Alert` row 생성 + `ActivityEvent` 기록. **runner 가 주입한 `company_id` 만** 사용 |
| `agent_task.create` | `AgentRegistryService.runByType` 으로 agent 위임. AI/LLM 진입점은 이것 하나뿐 |

## 제거된 executor (재도입 금지)

다음은 surface 축소 PR 에서 hard delete 됐다. 다시 등록하지 말 것:

- generic: `internal.db_query`, `api_call`, `action`, `data.filter`,
  `data_transform`
- AI alias: `ai_process` (→ `agent_task.create` 로 대체)
- legacy aliases: `trigger`, `trigger.event`, `condition`, `notification`

옛 template 이 위 타입을 가지고 실행되면 `getExecutor` 가 `undefined` 를
반환하고 runner 는 `Error("No executor for node type: <type>")` 를 throw —
`WorkflowRun.status = 'failed'`, `error` 에 메시지가 남고
`workflow_step_runs.error` 에도 동일 메시지가 기록된다. 이것이 의도한 실패
경로다.

## 새 executor 추가 규칙

새 노드 타입은 **domain-specific** 일 때만 추가한다 (예:
`coupang.orders.fetch`, `naver.reviews.fetch`). generic 추상화 노드는 더
이상 추가하지 않는다.

```
types.ts (standard 타입 추가)
  → catalog.ts (NodeDefinition 등록)
    → executors/{category}.ts 또는 builtin.ts 에 구현
      → registerNode() 호출
        → 프론트 nodeRegistry 동기화
```

External API 응답은 반드시 `executors/types.ts` 의 standard entity 로
정규화 (`StandardOrder`, `StandardProduct`, …). 외부 raw key 를 그대로
output 에 노출 금지.

## Tenant boundary (runner-injected only)

Runner 가 모든 노드 호출 직전에 `nodeDef.config.company_id` 와
`nodeDef.config._context` 를 **떼어내고**, 검증된 `template.companyId` 와
실행 시점의 `runContext` 로 덮어쓴다.

```ts
// workflow-runner.service.ts
const { company_id: _ignoredCompanyId, _context: _ignoredCtx, ...safeNodeConfig } =
  nodeDef.config ?? {};
const resolvedConfig = context.resolveConfig({
  ...safeNodeConfig,
  company_id: template.companyId, // runner 가 주입한 trusted 값
  _context: runContext,
});
```

따라서 template/client 가 어떤 `company_id` 를 노드 config 에 박아도
`notification.alert` 같은 side-effect executor 는 **항상** 소유 회사
스코프로만 쓴다. 새 executor 도 이 contract 에 의존해도 된다 — 그러나
client/template-provided `company_id` 를 신뢰하는 코드를 추가하지 말 것.

WorkflowRun 자체의 read/write 도 항상 `{ id: runId, companyId }` /
`{ id: templateId, companyId }` 로 묶여 있다 (`updateMany` / `findFirst`).
이 PR 의 외부에서도 이 패턴을 깨지 말 것.

## Execution Flow

1. `POST /api/workflows/:id/run` — `@CurrentCompany()` 가 trusted companyId
   주입 (DTO/query 의 companyId 신뢰 금지)
2. `WorkflowsService.triggerRun` — `findFirst({ id, companyId })` 로 템플릿
   소유권 검증 → `WorkflowRun(pending)` 생성 → fire-and-forget 으로
   `runner.runWorkflow(runId, templateId, template.companyId)` 호출
3. Runner — DAG 순회, 각 노드 executor 실행 → `WorkflowRun.steps` 누적
4. 실행 종료 → 후속 `runAnalysisAndRecord` 가 `agent_task.create` 형태로
   AI 분석 1회 실행, ActivityEvent 기록

Batch: `POST /api/workflows/batch-run` → 각 워크플로우는
`skipAnalysis: true` 로 실행되고 끝에 한 번 통합 AI 분석.

## Output Shape

| Pattern | Shape |
|---|---|
| Array data | `{ rows: T[], count: number }` |
| Platform data | `{ orders: StandardOrder[], count: number }` |
| Single action | `{ success: boolean, ... }` |
| Classification | `{ items: T[], overThreshold: T[], underThreshold: T[] }` |

Output key 이름은 `catalog.ts` 의 `outputSchema` 와 일치해야 한다.

## Error Handling

- executor 안에서 `throw` → 엔진이 catch, `workflow_step_runs.error` 에
  기록, 워크플로우 중단.
- 에러 메시지는 한국어 (end user 가 읽음).
- executor 안에서 silent swallow 금지. retry 로직 금지.

## Auto-Injected Config Fields (executor 에서 read-only)

엔진이 주입하는 필드. executor 는 절대로 set 하지 말 것.

- `company_id` — runner 가 검증된 template owner 로 강제 주입
- `_context` — `WorkflowRun.contextData` (productId 등)

## Data Flow

`context.ts` 의 `{{nodes.X.output.Y}}` 템플릿으로 노드 간 출력 참조.
