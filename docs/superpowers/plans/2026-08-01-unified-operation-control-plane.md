# Unified Operation Control Plane Implementation Plan

> **Superseded (2026-09-03):** Do not extend or resume this control-plane plan.
> Operations, schedules, browser claims, Workflow, and Panel projection are
> removed by the
> [Operation And Automation Hard Cutover Design](../specs/2026-09-03-operation-automation-hard-cutover-design.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 Agent OS와 개별 업무 화면의 수동 버튼은 동일한 실행 액션을 사용하고, Agent·서버 예약 실행은 Operations 제어면에서 동일 도메인 capability를 호출하도록 정리한다.

**Architecture:** 새 플랫폼 소유자인 operations가 코드 소유 Operation 카탈로그, 조직별 예약, 최상위 실행 ledger, 엔진 dispatch, 브라우저 lease를 소유한다. 수동 브라우저 업무는 대시보드와 기존 화면이 같은 frontend action을 호출하며, extension command·기본 입력·0건/로그인 판별·저장·생성 파일·알림 lifecycle을 공유한다. Trend와 Sellpia처럼 이미 durable owner sink 뒤에 있는 수동 업무는 그 action 내부에서 OperationRun을 시작한다. Agent·예약은 Operations를 통해 동일 owner capability를 호출한다. 대시보드의 Agent OS 명칭과 화면은 그대로 유지하며 새 범용 작업 제어 UI를 추가하지 않는다.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, Zod 3, React 19/Next.js, TanStack Query, Chrome Manifest V3, Vitest/Node test, cron-parser

---

## 기술 선택 근거

- Nest의 공식 scheduling 문서는 in-process interval/cron 등록을 제공하지만, 이 저장소는 이미 별도 worker process와 SKIP LOCKED queue 패턴을 사용한다. 따라서 API process에 dynamic cron job을 등록하지 않고 worker가 due schedule row를 claim한다: https://docs.nestjs.com/techniques/task-scheduling
- cron 계산은 timezone과 DST를 직접 구현하지 않고 cron-parser의 CronExpressionParser를 사용한다: https://www.npmjs.com/package/cron-parser

## 상태와 범위

- 문서 상태: 구현 기준선
- 작성일: 2026-08-01
- 변경 분류: 플랫폼 경계 재구성 + 운영 실행이라는 단일 업무 도메인의 cross-layer 변경
- 현재 release train: 0.1.30. 신규 빈 테이블을 추가하는 호환 schema 변경이므로 VERSION을 올리지 않는다.
- 데이터 결정: OperationRun과 OperationSchedule은 신규 빈 테이블로 시작한다. 기존 Alert, WorkflowRun, AgentRunRequest, AgentRun, AiDirectJob을 backfill하지 않는다.
- 배포 결정: npm run db:push와 npx prisma generate를 사용한다. 별도 data migration은 만들지 않는다.

## 구현 현황 (2026-08-01)

이번 변경에는 operations platform/ledger/schedule/API/worker/browser lease,
sourcing과 Sellpia의 Operation-backed 수동 action, extension runtime, 전역 Panel의
OperationRun 읽기 전용 투영이 포함된다.

수동 버튼 parity는 다음처럼 고정했다.

- `몰 주문수집`: 대시보드와 `/order-collection`이
  `useAllMarketplaceOrderCollection`을 사용한다. 동일 extension session과 몰별
  collector를 실행하고 동일 변환 파일을 IndexedDB history에 저장하며, 신규 주문
  0건과 로그인 필요를 같은 구조화 실패 근거로 구분한다.
- `쿠팡 쉽먼트 조회`: 두 화면이
  `collectAndPersistCoupangShipmentSummary`를 사용한다. 동일 validated extension
  command를 실행하고 서버 upsert 뒤 재조회 검증까지 완료한다.
- `쿠팡 로켓 PO 수집`: 두 화면이
  `collectAndPersistRocketPurchaseOrders`를 사용한다. 동일 월 범위 collector와
  catalog publication, collection-session terminal 처리를 수행한다.
- `시장분석`, `셀피아 동기화`: 두 화면이 각각
  `startTrendCollectionAction`, `startSellpiaInventoryRefreshAction`을 사용하고
  `sourceSurface`만 dashboard/domain_screen으로 다르다.

서버에 등록된 주문·쉽먼트·로켓 browser Operation은 Agent/예약 실행용이다. 수동
버튼의 기존 파일·달력·미리보기 결과를 count-only Operation 결과로 대체하지 않는다.

## 고정 결정

1. 대시보드의 Agent OS 명칭과 탭을 유지한다. 운영 업무나 자동화 센터로 이름을 바꾸지 않는다.
2. Agent OS는 UI 상위 개념이면서 자율 판단 runtime이다. 모든 작업을 AgentRun으로 바꾸지는 않는다.
3. Automation은 결정론적 workflow runtime이다. Automation node는 Agent OS run을 만들지 않는다.
4. 고정 AI 생성은 기존 AiDirectJob을 유지한다. 자율 판단이 최상위 소유자인 경우에만 Agent OS에서 시작한다.
5. 대시보드와 업무 화면의 수동 버튼은 동일 frontend action을 사용한다. Agent와 예약은 POST /api/operations/:operationKey/runs 또는 동일 incoming port를 사용한다.
6. 단순 CRUD와 짧은 동기 조회는 OperationRun을 만들지 않는다.
7. OperationAlert는 사용자 알림 projection이다. 실행 source of truth로 승격하지 않는다.
8. 브라우저 확장의 업무별 chrome.alarms는 서버 예약으로 이전한다. 확장은 서버 작업을 찾기 위한 단일 runtime wake alarm만 유지할 수 있다.
9. 예약/Agent browser Operation에서는 OperationRun.id가 브라우저 attempt의 상위 runId가 된다. 수동 브라우저 action의 기존 collection session ID는 화면 알림·취소·로그인 복구 계약을 위해 유지한다.
10. 대용량 파일과 canonical 도메인 결과는 generic Operation JSON에 넣지 않는다. 도메인 ingest API가 저장하고 Operation에는 안전한 참조만 남긴다.
11. 조직 소유 API는 organizationId를 인증 컨텍스트에서 받고 body/query 입력으로 받지 않는다.
12. 기존 직접 경로는 새 경로와 회귀 gate가 동작한 뒤에만 삭제한다.
13. 모든 schedule은 배포 직후 비활성 상태다. cron, timezone, 활성 상태는 API 계약으로 유지하며, 새로운 범용 예약 화면은 만들지 않는다. 업무별 기존 설정 화면이 준비될 때 그 화면에 연결한다.

## 기존 설계와의 관계

이 계획은 docs/superpowers/specs/2026-07-14-background-browser-collection-session-design.md의 다음 두 전제를 대체한다.

- Server-central browser command queue가 비목표라는 결정
- 로그인된 KidItem 웹 탭이 항상 열려 있어야 한다는 운영 가정

다음 계약은 계속 유효하다.

- 자동 수집은 inactive tab 또는 unfocused window에서 실행한다.
- 로그인, CAPTCHA, 권한, 수동 확인은 조용히 성공 처리하지 않고 attention_required로 남긴다.
- marketplace cookie, token, credential, raw response body를 KidItem에 전달하지 않는다.
- 사용자가 명시적으로 요청하기 전에는 marketplace 탭을 focus하지 않는다.
- service-worker 재시작을 견디도록 extension-local tab/session 제어 상태를 유지한다.

## 목표 실행 흐름

~~~text
Dashboard Agent OS ─┐
Domain screen ──────┴─> shared manual action
                          ├─ extension + owner API/sink
                          └─ OperationRun when that action is Operation-backed

Agent tool ─────────┐
Schedule worker ────┴─> Operations incoming port -> OperationRun
                                                   ├─ deterministic domain capability
                                                   ├─ WorkflowRun
                                                   ├─ AgentRunRequest / AgentRun
                                                   ├─ AiDirectJob
                                                   ├─ browser runtime lease
                                                   └─ child OperationRun fan-out

OperationRun state -> 기존 업무 화면 상태/결과 + global panel projection
OperationAlert     -> attention/notification projection only
~~~

## 공통 상태

| 상태 | 의미 | 허용되는 다음 상태 |
|---|---|---|
| queued | claim 대기 | running, waiting_runtime, cancelled, skipped, failed |
| waiting_runtime | 브라우저 등 외부 runtime 대기 | running, attention_required, cancelled, failed |
| running | handler 또는 native 실행 중 | attention_required, succeeded, failed, cancelled |
| attention_required | 로그인·CAPTCHA·권한·사용자 결정 대기 | waiting_runtime, running, cancelled, failed |
| succeeded | canonical 결과 저장 완료 | 없음 |
| failed | 재시도 소진 또는 비재시도 실패 | 없음 |
| cancelled | 사용자·시스템 취소 완료 | 없음 |
| skipped | misfire 또는 dedupe로 실행하지 않음 | 없음 |

Native owner adapter가 위 상태로 명시적으로 매핑한다. WorkflowRun.completed 같은 별도 문자열을 새로 만들지 않고 canonical succeeded를 사용한다.

## 최초 Operation 카탈로그

| Operation key | Owner | Engine | 예약 | 결과 sink |
|---|---|---|---|---|
| sourcing.collect_daily_trends | sourcing | composite/domain+browser | 가능 | sourcing trend tables |
| sourcing.collect_1688_trends | sourcing | browser | 상위 실행 전용 | sourcing trend ingest |
| sourcing.collect_live_commerce_trends | sourcing | browser | 상위 실행 전용 | sourcing trend ingest |
| sourcing.collect_tiktok_cc_trends | sourcing | browser | 상위 실행 전용 | sourcing trend ingest |
| inventory.refresh_sellpia_snapshot | inventory | browser | 가능 | inventory freshness/import |
| orders.collect_all_marketplace_orders | orders | browser | 가능 | marketplace export collection result |
| orders.collect_mall | orders | browser | 상위 실행 전용 | order artifacts/imports |
| inventory.collect_coupang_shipment_summary | inventory | browser | 가능 | shipment date-summary |
| channels.collect_coupang_rocket_purchase_orders | channels | browser | 가능 | Rocket PO catalog snapshot |
| advertising.collect_daily_facts | advertising | composite/browser | 가능 | advertising ingest |
| channels.import_coupang_catalog | channels | browser | 가능 | channel catalog import |
| ai.generate_product_content | ai | ai_direct | 불가 | AI workspace/artifacts |
| sourcing.recommend_products | sourcing | agent_os | 가능 | sourcing finalized sink |

## 파일 책임 지도

### 새 플랫폼 소유

| Path | 책임 |
|---|---|
| apps/server/src/operations/AGENTS.md | Operations 경계와 verification |
| apps/server/src/operations/operations.module.ts | platform wiring과 exported incoming ports |
| apps/server/src/operations/domain/operation-run-policy.ts | 순수 상태 전이 |
| apps/server/src/operations/application/port/in/operation-runner.port.ts | 화면·Agent·schedule 공통 시작/조회/cancel |
| apps/server/src/operations/application/port/in/operation-handler-registry.port.ts | owner handler 등록 |
| apps/server/src/operations/application/port/out/repository/operation.repository.port.ts | run/schedule/lease persistence |
| apps/server/src/operations/application/service/operation-handler-registry.service.ts | code-owned definition registry |
| apps/server/src/operations/application/service/operation-run.service.ts | 생성, 멱등성, 조회, 상태 전이 |
| apps/server/src/operations/application/service/operation-dispatcher.service.ts | owner handler dispatch |
| apps/server/src/operations/application/service/operation-run-worker.service.ts | server queue drain |
| apps/server/src/operations/application/service/operation-scheduler.service.ts | due schedule claim |
| apps/server/src/operations/adapter/in/http/operations.controller.ts | catalog/run/query/cancel API |
| apps/server/src/operations/adapter/in/http/operation-schedules.controller.ts | schedule API |
| apps/server/src/operations/adapter/in/http/browser-operation-runtime.controller.ts | browser claim/heartbeat/report |
| apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts | Prisma와 fenced raw SQL |
| apps/server/src/operations/adapter/out/panel/operation-panel.mapper.ts | panel snapshot projection mapper |

### 공통 계약과 소비자

| Path | 변경 |
|---|---|
| packages/shared/src/schemas/operations.ts | operation wire schemas |
| packages/shared/src/operations.ts | focused subpath export |
| prisma/models/system.prisma | OperationRun, OperationSchedule |
| prisma/models/core.prisma | Organization/User relations |
| apps/server/src/sourcing/domain/operation/sourcing.operations.ts | sourcing definitions; inventory/orders/advertising/channels/ai follow the same owner-local shape |
| apps/server/src/sourcing/adapter/in/operation/sourcing-trend.operation-handler.ts | owner incoming capability adapter reference implementation |
| apps/web/src/lib/operations-api.ts | shared API client |
| apps/web/src/hooks/useOperationRun.ts | run polling/mutation |
| extensions/kiditem-os/background/operation-runtime-client.js | claim/heartbeat/report |

## Task 1: 플랫폼 경계와 회귀 gate 고정

**Files:**
- Create: apps/server/src/operations/AGENTS.md
- Create: apps/server/src/operations/__tests__/operations-boundary.spec.ts
- Modify: AGENTS.md
- Modify: docs/ARCHITECTURE.md
- Modify: docs/superpowers/specs/2026-07-14-background-browser-collection-session-design.md

- [ ] **Step 1: 새 owner 문서화 실패 테스트 작성**

~~~typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('operations platform boundary', () => {
  it('is a documented platform owner', () => {
    expect(read('AGENTS.md')).toContain(
      '| `operations` | operation catalog, schedules, run envelope, engine dispatch |',
    );
    expect(read('docs/ARCHITECTURE.md')).toContain('apps/server/src/operations');
  });
});
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations/__tests__/operations-boundary.spec.ts

Expected: FAIL because the owner is absent.

- [ ] **Step 3: owner map과 scoped guide 추가**

AGENTS.md owner map에 위 exact row를 추가한다. Operations guide에는 다음을 고정한다.

~~~text
Operations never writes canonical business rows.
Owner modules register handlers that call their own incoming capabilities.
Automation never creates Agent OS runs.
Agent OS may invoke deterministic Operations through the published incoming port.
OperationAlert is a notification projection, not the run ledger.
Browser leases are fenced by attemptToken.
Every mutation and single-run read includes organizationId.
~~~

- [ ] **Step 4: architecture dependency와 supersession 기록**

~~~text
screen/schedule/agent-os -> operations -> owner incoming capability
operations -> automation workflow port
operations -> agent-os runner port
operations -> ai direct-job port
automation -X-> agent-os
~~~

기존 browser design 상단에는 server-owned queue/schedule만 이 계획이 supersede하고 background/attention/security 계약은 유지된다고 기록한다.

- [ ] **Step 5: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations/__tests__/operations-boundary.spec.ts && rtk npm run check:agents-hygiene

Expected: PASS.

~~~bash
rtk git add AGENTS.md docs/ARCHITECTURE.md docs/superpowers/specs/2026-07-14-background-browser-collection-session-design.md apps/server/src/operations
rtk git commit -m "docs: define unified operations platform boundary"
~~~

## Task 2: shared Operation wire contract 추가

**Files:**
- Create: packages/shared/src/schemas/operations.ts
- Create: packages/shared/src/schemas/operations.spec.ts
- Create: packages/shared/src/operations.ts
- Modify: packages/shared/package.json
- Modify: packages/shared/tsup.config.ts

- [ ] **Step 1: schema 실패 테스트 작성**

~~~typescript
it('rejects tenant input and requires browser fencing', () => {
  expect(() => CreateOperationRunRequestSchema.parse({
    sourceSurface: 'dashboard',
    organizationId: 'forbidden',
    input: {},
  })).toThrow();

  expect(() => BrowserOperationReportRequestSchema.parse({
    status: 'running',
    progress: 0.5,
  })).toThrow();
});
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk npm exec --workspace=packages/shared vitest -- run src/schemas/operations.spec.ts

Expected: FAIL because the schema does not exist.

- [ ] **Step 3: canonical schemas 구현**

~~~typescript
export const OperationStatusSchema = z.enum([
  'queued', 'waiting_runtime', 'running', 'attention_required',
  'succeeded', 'failed', 'cancelled', 'skipped',
]);
export const OperationEngineTypeSchema = z.enum([
  'domain', 'composite', 'workflow', 'agent_os', 'ai_direct', 'browser',
]);
export const OperationTriggerSourceSchema = z.enum([
  'dashboard', 'domain_screen', 'agent', 'schedule', 'system',
]);
export const CreateOperationRunRequestSchema = z.object({
  sourceSurface: z.enum(['dashboard', 'domain_screen']),
  input: z.record(z.unknown()).default({}),
}).strict();
export const UpsertOperationScheduleRequestSchema = z.object({
  cronExpression: z.string().min(9).max(120),
  timeZone: z.string().min(1).max(80),
  misfirePolicy: z.enum(['skip', 'catch_up_once']),
  enabled: z.boolean(),
  input: z.record(z.unknown()).default({}),
}).strict();
export const BrowserOperationReportRequestSchema = z.object({
  attemptToken: z.string().uuid(),
  status: z.enum(['running', 'attention_required', 'succeeded', 'failed']),
  progress: z.number().min(0).max(1).nullable().optional(),
  result: z.record(z.unknown()).optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(2000).optional(),
  attentionReason: z.string().max(120).optional(),
}).strict();
~~~

OperationRunSchema는 id, operationKey, title, ownerDomain, engineType, status, triggerSource, parentRunId, scheduleId, nativeRunType/nativeRunId, progress, result, error, actor, scheduled/start/finish/create/update timestamp를 strict object로 정의한다.

- [ ] **Step 4: focused export만 추가**

packages/shared/src/operations.ts는 schemas/operations.js만 export한다. package exports, typesVersions, tsup entries에 operations를 추가하고 root barrel은 확장하지 않는다.

- [ ] **Step 5: 검증과 커밋**

Run: rtk npm exec --workspace=packages/shared vitest -- run src/schemas/operations.spec.ts && rtk npm run build --workspace=packages/shared

Expected: PASS.

~~~bash
rtk git add packages/shared
rtk git commit -m "feat: add unified operation contracts"
~~~

## Task 3: durable ledger와 schedule schema 추가

**Files:**
- Modify: prisma/models/system.prisma
- Modify: prisma/models/core.prisma
- Create: apps/server/src/operations/__tests__/operation-schema-contract.spec.ts
- Regenerate: docs/ERD.md, docs/erd/system.md, docs/erd/core.md, and the generator-owned graphify-out/schema directory

- [ ] **Step 1: schema shape 실패 테스트 작성**

~~~typescript
expect(systemSchema).toContain('model OperationRun {');
expect(systemSchema).toContain('attemptToken');
expect(systemSchema).toContain('leaseExpiresAt');
expect(systemSchema).toContain('model OperationSchedule {');
expect(systemSchema).toContain('cronExpression');
expect(systemSchema).toContain('nextRunAt');
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations/__tests__/operation-schema-contract.spec.ts

Expected: FAIL.

- [ ] **Step 3: OperationRun model 구현**

필드는 다음 exact contract를 사용한다.

~~~text
id UUID
organizationId UUID
operationKey, definitionVersion, ownerDomain, title, engineType, status
triggerSource, requestedByUserId, parentRunId, scheduleId
idempotencyKey, input JsonB, result JsonB, progress
nativeRunType, nativeRunId
attempts, maxAttempts, claimedBy, attemptToken UUID
claimedAt, leaseExpiresAt, scheduledFor
errorCode, errorMessage, startedAt, finishedAt, createdAt, updatedAt
~~~

Indexes:

~~~prisma
@@unique([id, organizationId], map: "operation_runs_id_org_key")
@@unique([organizationId, operationKey, idempotencyKey], map: "operation_runs_idempotency_key", where: raw("idempotency_key IS NOT NULL"))
@@index([organizationId, status, createdAt])
@@index([status, scheduledFor])
@@index([status, leaseExpiresAt])
@@index([parentRunId])
@@index([scheduleId])
@@index([organizationId, nativeRunType, nativeRunId])
~~~

- [ ] **Step 4: OperationSchedule model 구현**

~~~text
id UUID, organizationId UUID, operationKey
cronExpression, timeZone default Asia/Seoul
misfirePolicy default catch_up_once
input JsonB, enabled default false
nextRunAt, lastScheduledFor, createdByUserId
createdAt, updatedAt
unique organizationId + operationKey
index enabled + nextRunAt
~~~

Organization과 User에 양방향 relations를 추가한다. native PostgreSQL enum은 만들지 않는다.

- [ ] **Step 5: schema와 artifacts 검증**

Run: rtk npm run db:push && rtk npx prisma generate && rtk npm run build --workspace=packages/shared && rtk npm run db:erd && rtk npm run graphify:schema

Expected: compatible push, generation, builds PASS; Operation models appear in navigation output.

- [ ] **Step 6: 커밋**

~~~bash
rtk git add prisma/models docs/ERD.md docs/erd graphify-out apps/server/src/operations/__tests__/operation-schema-contract.spec.ts
rtk git commit -m "feat: add durable operation runs and schedules"
~~~

## Task 4: code-owned definition과 handler registry 구축

**Files:**
- Create: apps/server/src/common/operation-definition.ts
- Create: apps/server/src/operations/application/port/in/operation-handler-registry.port.ts
- Create: apps/server/src/operations/application/service/operation-handler-registry.service.ts
- Create: apps/server/src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts
- Create: apps/server/src/operations/operations.module.ts
- Modify: apps/server/src/app.module.ts

- [ ] **Step 1: duplicate와 input validation 실패 테스트 작성**

~~~typescript
registry.register(definition, handler);
expect(() => registry.register(definition, handler)).toThrow('duplicate operation key');
expect(() => registry.parseInput(definition.key, { sources: 'naver' })).toThrow();
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts

Expected: FAIL.

- [ ] **Step 3: definition과 handler contract 구현**

~~~typescript
export interface OperationDefinition {
  key: string;
  version: number;
  title: string;
  ownerDomain: string;
  engineType: OperationEngineType;
  allowedTriggers: readonly OperationTriggerSource[];
  scheduleSupported: boolean;
  maxAttempts: number;
  inputSchema: z.ZodType<Record<string, unknown>>;
}
export type OperationHandlerResult =
  | { kind: 'completed'; result: Record<string, unknown> }
  | { kind: 'delegated'; nativeRunType: string; nativeRunId: string }
  | { kind: 'waiting_runtime' };
export interface OperationHandler {
  execute(context: OperationHandlerContext): Promise<OperationHandlerResult>;
  cancel?(context: OperationCancelContext): Promise<void>;
}
~~~

Registry는 register, getDefinition, getHandler, parseInput, listDefinitions만 노출하고 duplicate key를 fail-fast한다.

- [ ] **Step 4: module wiring**

OperationsModule은 registry를 singleton provider로 export한다. AppModule은 OperationsModule을 AgentOsModule과 AutomationModule보다 먼저 import한다. OperationsModule은 owner module을 import하지 않는다.

- [ ] **Step 5: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-handler-registry.service.spec.ts && rtk npm run build --workspace=apps/server

Expected: PASS.

~~~bash
rtk git add apps/server/src/common/operation-definition.ts apps/server/src/operations apps/server/src/app.module.ts
rtk git commit -m "feat: add operation definition registry"
~~~

## Task 5: run repository, 시작 API, 멱등성 구현

**Files:**
- Create: apps/server/src/operations/application/port/in/operation-runner.port.ts
- Create: apps/server/src/operations/application/port/out/repository/operation.repository.port.ts
- Create: apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts
- Create: apps/server/src/operations/application/service/operation-run.service.ts
- Create: apps/server/src/operations/application/service/__tests__/operation-run.service.spec.ts
- Create: apps/server/src/operations/adapter/in/http/operations.controller.ts
- Create: apps/server/src/operations/adapter/in/http/dto/operation-run.dto.ts
- Create: apps/server/src/operations/adapter/in/http/__tests__/operations.controller.spec.ts
- Modify: apps/server/src/operations/operations.module.ts

- [ ] **Step 1: idempotency와 trigger policy 실패 테스트 작성**

~~~typescript
const first = await service.start(command);
const second = await service.start(command);
expect(first.id).toBe(second.id);
expect(repository.createRun).toHaveBeenCalledTimes(1);

await expect(service.start({ ...command, triggerSource: 'agent' }))
  .rejects.toThrow('trigger_not_allowed');
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations/application/service/__tests__/operation-run.service.spec.ts

Expected: FAIL.

- [ ] **Step 3: repository port와 adapter 구현**

Repository port는 findRunById, findByIdempotencyKey, createRun, listRuns, transition을 정의한다. createRun은 partial unique 충돌 시 동일 idempotency row를 다시 읽는다. single resource predicate는 항상 id와 organizationId를 포함한다.

- [ ] **Step 4: HTTP API 구현**

~~~text
GET  /api/operations
POST /api/operations/:operationKey/runs
GET  /api/operations/runs
GET  /api/operations/runs/:runId
POST /api/operations/runs/:runId/cancel
~~~

POST는 202를 반환한다. Idempotency-Key header는 최대 200자로 검증한다. HTTP sourceSurface은 dashboard와 domain_screen만 허용하고 Agent와 schedule은 incoming port로 호출한다.

- [ ] **Step 5: tenant test 추가**

body의 organizationId가 거부되고 service가 decorator의 조직/사용자 ID만 받는지 검증한다. 다른 조직 run 조회와 cancel은 404다.

- [ ] **Step 6: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations && rtk npm run check:idor && rtk npm run check:tenant-scope && rtk npm run build --workspace=apps/server

Expected: PASS.

~~~bash
rtk git add apps/server/src/operations
rtk git commit -m "feat: add operation run api and idempotency"
~~~

## Task 6: dispatcher, worker, cron schedule 구현

**Files:**
- Modify: apps/server/package.json, package-lock.json
- Create: apps/server/src/operations/application/service/operation-schedule-clock.ts
- Create: apps/server/src/operations/application/service/__tests__/operation-schedule-clock.spec.ts
- Create: apps/server/src/operations/application/service/operation-dispatcher.service.ts
- Create: apps/server/src/operations/application/service/operation-run-worker.service.ts
- Create: apps/server/src/operations/application/service/operation-scheduler.service.ts
- Create: apps/server/src/operations/application/service/__tests__/operation-run-worker.service.spec.ts
- Create: apps/server/src/operations/application/service/__tests__/operation-scheduler.service.spec.ts
- Create: apps/server/src/operations/adapter/in/http/operation-schedules.controller.ts
- Create: apps/server/src/operations/adapter/out/repository/__tests__/operation.repository.adapter.pg.integration.spec.ts
- Modify: apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts
- Modify: docs/runbooks/environment-variables.md

- [ ] **Step 1: timezone와 DST 실패 테스트 작성**

~~~typescript
expect(nextOccurrence(
  '0 6 * * *',
  'Asia/Seoul',
  new Date('2026-08-01T00:00:00Z'),
).toISOString()).toBe('2026-08-01T21:00:00.000Z');
expect(() => nextOccurrence('0 6 * * *', 'Mars/Olympus', new Date()))
  .toThrow('invalid_timezone');
~~~

- [ ] **Step 2: cron-parser 설치와 clock 구현**

Run: rtk npm install cron-parser --workspace=apps/server

CronExpressionParser.parse(expression, { currentDate, tz, strict: true }).next().toDate()를 사용한다. 5-field cron만 허용한다.

- [ ] **Step 3: PostgreSQL claim test 작성**

~~~text
two workers claim one queued run -> one winner
two schedulers claim one due schedule -> one OperationRun
stale attemptToken terminal update -> rejected
expired lease -> reclaimed and attempts increments
other organization schedule -> never returned
~~~

Claim은 Prisma tagged query와 FOR UPDATE SKIP LOCKED를 사용하고 identifier를 동적으로 보간하지 않는다.

- [ ] **Step 4: dispatcher mapping 구현**

~~~typescript
switch (result.kind) {
  case 'completed':
    return repository.succeed(runId, attemptToken, result.result);
  case 'delegated':
    return repository.markDelegated(runId, attemptToken, result.nativeRunType, result.nativeRunId);
  case 'waiting_runtime':
    return repository.waitForRuntime(runId, attemptToken);
}
~~~

Unknown handler는 operation_handler_not_registered, scrubbed owner failure는 operation_execution_failed다. retryable 오류는 queued로 돌리고 attempts가 maxAttempts에 도달하면 failed다.

- [ ] **Step 5: worker/scheduler loop 구현**

기존 AgentRunWorker의 OnModuleInit, OnModuleDestroy, busy guard, unref timer 패턴을 재사용한다.

~~~text
OPERATION_RUNTIME_WORKER_ENABLED default 0
OPERATION_RUNTIME_WORKER_INTERVAL_MS default 2000
OPERATION_SCHEDULER_ENABLED default 0
OPERATION_SCHEDULER_INTERVAL_MS default 30000
OPERATION_RUN_LEASE_MS default 60000
~~~

- [ ] **Step 6: schedule API 구현**

~~~text
GET    /api/operation-schedules
PUT    /api/operation-schedules/:operationKey
DELETE /api/operation-schedules/:operationKey
~~~

DELETE는 row를 지우지 않고 enabled=false, nextRunAt=null로 만든다. schedule 미지원 definition은 schedule_not_supported다.

- [ ] **Step 7: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations && rtk npm run test:integration --workspace=apps/server -- src/operations/adapter/out/repository/__tests__/operation.repository.adapter.pg.integration.spec.ts

Expected: PASS.

~~~bash
rtk git add apps/server package-lock.json docs/runbooks/environment-variables.md
rtk git commit -m "feat: add durable operation scheduler and worker"
~~~

## Task 7: browser runtime lease 프로토콜 구축

**Files:**
- Modify: packages/shared/src/schemas/operations.ts, packages/shared/src/schemas/operations.spec.ts
- Create: apps/server/src/operations/application/service/browser-operation-runtime.service.ts
- Create: apps/server/src/operations/application/service/__tests__/browser-operation-runtime.service.spec.ts
- Create: apps/server/src/operations/adapter/in/http/browser-operation-runtime.controller.ts
- Create: apps/server/src/operations/adapter/in/http/__tests__/browser-operation-runtime.controller.spec.ts
- Modify: apps/server/src/operations/adapter/out/repository/operation.repository.adapter.ts
- Modify: apps/server/src/operations/operations.module.ts

- [ ] **Step 1: claim contract 확정**

~~~typescript
const BrowserOperationClaimSchema = z.object({
  runId: z.string().uuid(),
  operationKey: z.string(),
  attemptToken: z.string().uuid(),
  attempt: z.number().int().positive(),
  input: z.record(z.unknown()),
  leaseExpiresAt: z.string().datetime(),
}).strict();
~~~

Report result는 32KB 이하 안전 JSON만 허용한다. file, base64, rows, raw payload key를 refinement로 거부한다.

- [ ] **Step 2: stale fence 실패 테스트 작성**

~~~typescript
repository.reportBrowserRun.mockResolvedValue(null);
await expect(service.report({
  organizationId: ORG_ID,
  runId: RUN_ID,
  attemptToken: OLD_TOKEN,
  status: 'succeeded',
  result: { imported: 10 },
})).rejects.toThrow('browser_runtime_fence_lost');
~~~

- [ ] **Step 3: authenticated runtime API 구현**

~~~text
POST /api/operation-runtime/browser/claim
POST /api/operation-runtime/browser/runs/:runId/heartbeat
POST /api/operation-runtime/browser/runs/:runId/report
~~~

Claim predicate는 인증 조직, allowed operation keys, engineType=browser, claimable status, lease expiry를 모두 포함한다. runtimeId와 environmentId는 routing metadata일 뿐 tenant authority가 아니다.

- [ ] **Step 4: attention/retry 구현**

attention_required report는 lease를 해제하고 reason/message를 저장한다. retry는 같은 run을 waiting_runtime으로 바꾼다. terminal/cancelled run report는 409다.

- [ ] **Step 5: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations && rtk npm exec --workspace=packages/shared vitest -- run src/schemas/operations.spec.ts

Expected: PASS.

~~~bash
rtk git add packages/shared apps/server/src/operations
rtk git commit -m "feat: add fenced browser operation runtime"
~~~

## Task 8: sourcing server capability pilot 전환

**Files:**
- Create: apps/server/src/sourcing/domain/operation/sourcing.operations.ts
- Create: apps/server/src/sourcing/application/port/in/trend-collection.port.ts
- Create: apps/server/src/sourcing/adapter/in/operation/sourcing-trend.operation-handler.ts
- Create: apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts
- Modify: apps/server/src/sourcing/application/service/trend-collect.service.ts
- Modify: apps/server/src/sourcing/adapter/in/http/trend-collection.controller.ts
- Modify: apps/server/src/sourcing/sourcing.module.ts
- Modify: apps/server/src/sourcing/__tests__/sourcing.module.wiring.spec.ts

- [ ] **Step 1: definition과 partial failure test 작성**

~~~typescript
expect(SOURCING_OPERATIONS[0]).toMatchObject({
  key: 'sourcing.collect_daily_trends',
  ownerDomain: 'sourcing',
  engineType: 'composite',
  scheduleSupported: true,
});
await expect(handler.execute(allFailedContext)).rejects.toThrow('trend_collection_failed');
await expect(handler.execute(partialContext)).resolves.toEqual({
  kind: 'completed',
  result: expect.objectContaining({ warningCount: 1 }),
});
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk npm exec --workspace=apps/server vitest -- run src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts

Expected: FAIL.

- [ ] **Step 3: incoming port와 adapter 구현**

TrendCollectService가 TrendCollectionPort를 구현한다. Operation adapter는 onModuleInit에서 definition과 자신을 registry에 등록한다. 수집 로직은 복제하지 않는다. 첫 pilot input은 server-owned source만 실행한다. 모든 요청 source가 실패하면 failed, 일부 성공은 succeeded와 warningCount를 기록한다. 세 browser source child는 Task 10에서 같은 composite handler에 추가한다.

- [ ] **Step 4: legacy HTTP compatibility 전환**

POST /api/sourcing/trend/collect은 직접 수집하지 않고 OPERATION_RUNNER_PORT.start를 호출하여 202 OperationRun을 반환한다. 해당 web consumers는 Task 9와 같은 배포 단위에서 전환한다.

- [ ] **Step 5: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/sourcing src/operations

Expected: PASS.

~~~bash
rtk git add apps/server/src/sourcing apps/server/src/operations
rtk git commit -m "feat: route sourcing trend collection through operations"
~~~

## Task 9: web Operations client와 기존 버튼 전환

**Files:**
- Create: apps/web/src/lib/operations-api.ts
- Create: apps/web/src/lib/__tests__/operations-api.spec.ts
- Create: apps/web/src/hooks/useOperationRun.ts
- Create: apps/web/src/hooks/useOperationRun.spec.tsx
- Modify: apps/web/src/lib/query-keys.ts
- Modify: apps/web/src/app/(analytics)/dashboard/hooks/use-department-quick-actions.ts
- Modify: apps/web/src/app/(analytics)/dashboard/components/DashboardChartPanel.tsx
- Modify: apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/trend-collection-api.ts
- Modify: apps/web/src/app/(sourcing-ai)/sourcing-ai/category-sourcing/lib/toy-trend-api.ts
- Modify: apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingHomeHero.tsx

- [ ] **Step 1: shared client endpoint 실패 테스트 작성**

~~~typescript
await operationsApi.start('sourcing.collect_daily_trends', {
  sourceSurface: 'dashboard',
  input: { sources: ['naver'] },
  idempotencyKey: 'click-1',
});
expect(mockApiPost).toHaveBeenCalledWith(
  '/api/operations/sourcing.collect_daily_trends/runs',
  { sourceSurface: 'dashboard', input: { sources: ['naver'] } },
  { headers: { 'Idempotency-Key': 'click-1' } },
);
~~~

- [ ] **Step 2: API client와 query keys 구현**

operationsApi는 catalog, runs, run, start, cancel, schedules, upsertSchedule, disableSchedule만 노출한다. query keys는 operations/catalog, operations/runs, operations/run/:id, operations/schedules다.

- [x] **Step 3: dashboard/domain 공통 action 회귀 test 작성**

~~~typescript
expect(dashboardSource).toContain('useAllMarketplaceOrderCollection');
expect(orderScreenSource).toContain('useAllMarketplaceOrderCollection');
expect(dashboardSource).toContain('collectAndPersistCoupangShipmentSummary');
expect(shipmentScreenSource).toContain('collectAndPersistCoupangShipmentSummary');
~~~

- [x] **Step 4: quick actions를 공통 수동 action dispatcher로 정리**

~~~typescript
if (action === 'collectAllOrders') return collectAllOrders();
if (action === 'collectCoupangShipmentSummary') return collectShipmentSummary();
if (action === 'collectCoupangRocketPurchaseOrders') return collectRocketPurchaseOrders();
~~~

주문·쉽먼트·로켓은 기존 화면과 동일 action을 호출한다. Trend·Sellpia action만 내부에서 operationsApi.start를 호출한다.

- [x] **Step 5: 기존 화면의 상태·결과 UI 보존**

새 Agent OS 작업 패널, 범용 실행 카드, 범용 예약 화면을 만들지 않는다. 기존 화면의 진행 상태·완료 결과·오류 표현을 유지한다. 대시보드는 같은 action의 toast와 browser collection alert를 사용하고 별도 “요청 중” 알림을 덧붙이지 않는다. 전역 알림 패널은 `내 작업` 전용 카드 구역 없이 하나의 알림 행 목록으로 렌더하며, Shipment/Rocket은 각각 고유 producer로 동일 행 lifecycle을 연다.

- [ ] **Step 6: 모든 trend consumer 전환**

시장분석, 카테고리 소싱, sourcing hero는 동일 key와 sourceSurface=domain_screen을 사용한다.

- [ ] **Step 7: 검증과 커밋**

Run: rtk npm exec --workspace=apps/web vitest -- run src/lib src/hooks 'src/app/(analytics)/dashboard' 'src/app/(sourcing-ai)/sourcing-ai' && rtk npm run build --workspace=apps/web

Expected: PASS; dashboard와 업무 화면이 같은 action symbol을 호출한다.

~~~bash
rtk git add apps/web
rtk git commit -m "refactor: run dashboard agent os actions through operations"
~~~

## Task 10: extension을 server-owned work consumer로 전환

**Files:**
- Create: extensions/kiditem-os/background/operation-runtime-client.js
- Create: extensions/tests/operation-runtime-client.test.mjs
- Modify: extensions/kiditem-os/background/domain-registry.js
- Modify: extensions/kiditem-os/background/service-worker.js
- Modify: extensions/kiditem-os/background/worker-globals.js
- Modify: extensions/kiditem-os/background/orders/worker.js
- Modify: extensions/kiditem-os/background/coupang/worker.js
- Modify: extensions/kiditem-os/background/sourcing/worker.js
- Modify: extensions/kiditem-os/manifest.json

- [ ] **Step 1: runtime client 실패 테스트 작성**

~~~javascript
await client.tick('office');
assert.equal(fetchCalls[0].path, '/api/operation-runtime/browser/claim');
assert.equal(fetchCalls[1].body.attemptToken, ATTEMPT_TOKEN);
assert.deepEqual(createdBusinessAlarmNames, []);
assert.deepEqual(createdRuntimeAlarmNames, ['kiditem-operation-runtime-claim:office']);
~~~

- [ ] **Step 2: 실패 확인**

Run: rtk node --test extensions/tests/operation-runtime-client.test.mjs

Expected: FAIL.

- [ ] **Step 3: domain registry seam 추가**

KidItemDomains.register가 operations: Record<string, handler>를 받고 duplicate exact key를 거부한다. runOperation은 exact key만 dispatch한다. arbitrary action이나 URL generic executor는 만들지 않는다.

- [ ] **Step 4: runtime client 구현**

각 environment profile token으로 claim하고 한 tick에서 environment당 한 작업만 실행한다. handler 진행 중 lease의 1/3 주기로 heartbeat하며 terminal report에 같은 attemptToken을 보낸다. 기존 environment-context의 401 1회 갱신 계약을 재사용한다.

- [ ] **Step 5: 단일 wake alarm 추가**

kiditem-operation-runtime-claim:{environmentId}를 1분 간격으로 설치한다. web manual start는 wake message만 보낼 수 있고 실행 payload를 보내지 않는다.

- [ ] **Step 6: 큰 worker에는 registration만 추가**

orders, coupang, sourcing worker의 KidItemDomains.register block에는 closure만 추가한다. HTTP/lease/retry는 새 300줄 이하 runtime client에 둔다.

- [ ] **Step 7: 검증**

Run: rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs && rtk node --check extensions/kiditem-os/background/service-worker.js && rtk node -e "JSON.parse(require('fs').readFileSync('extensions/kiditem-os/manifest.json','utf8'))" && rtk git diff --check -- extensions

Expected: PASS.

- [ ] **Step 8: unpacked Chrome acceptance**

~~~text
worker console error 없음
ping browserOperationRuntimeV1=true
manual OperationRun 60초 안에 claim
environment 교차 claim 없음
service-worker 재시작 후 같은 run report
~~~

- [ ] **Step 9: 커밋**

~~~bash
rtk git add extensions
rtk git commit -m "feat: consume browser operations from the server"
~~~

## Task 11: Sellpia inventory를 첫 browser Operation으로 cut over

**Files:**
- Create: apps/server/src/inventory/domain/operation/inventory.operations.ts
- Create: apps/server/src/inventory/adapter/in/operation/sellpia-inventory.operation-handler.ts
- Create: apps/server/src/inventory/adapter/in/operation/__tests__/sellpia-inventory.operation-handler.spec.ts
- Modify: apps/server/src/inventory/inventory.module.ts
- Modify: apps/web/src/hooks/useSellpiaInventoryFreshness.ts
- Modify: apps/web/src/components/providers/SellpiaInventorySyncProvider.tsx
- Modify: apps/web/src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx
- Modify: apps/web/src/lib/sellpia-inventory-extension.ts
- Modify: extensions/kiditem-os/background/orders/worker.js
- Modify: extensions/tests/order-collector-sellpia-inventory.test.mjs

- [ ] **Step 1: definition과 waiting runtime test**

~~~typescript
expect(INVENTORY_OPERATIONS).toContainEqual(expect.objectContaining({
  key: 'inventory.refresh_sellpia_snapshot',
  ownerDomain: 'inventory',
  engineType: 'browser',
  scheduleSupported: true,
}));
await expect(handler.execute(context)).resolves.toEqual({ kind: 'waiting_runtime' });
~~~

- [ ] **Step 2: Inventory registration 구현**

handler는 safe input identity만 남긴다. 실제 snapshot import는 기존 freshness lease/import endpoint를 사용하며 Inventory만 canonical stock을 쓴다.

- [ ] **Step 3: extension handler 연결**

runSellpiaInventoryOperation은 claim.runId를 collector runId와 freshness attempt identity로 사용한다. 성공 조건은 collection이 아니라 Inventory import finalization 성공이다.

- [ ] **Step 4: web provider를 projection consumer로 축소**

Provider는 run ID 발급, extension start, OperationAlert lifecycle을 소유하지 않는다. UI는 OperationRun과 freshness history를 읽고 retry/open-attention만 호출한다.

- [ ] **Step 5: 검증과 수동 acceptance**

Run: rtk npm exec --workspace=apps/server vitest -- run src/inventory src/operations && rtk npm exec --workspace=apps/web vitest -- run src/hooks/useSellpiaInventoryFreshness.spec.tsx src/components/providers/__tests__/SellpiaInventorySyncProvider.spec.tsx && rtk node --test extensions/tests/order-collector-sellpia-inventory.test.mjs

Expected: PASS.

~~~text
web tab 닫힘 + Chrome 켜짐 -> scheduled import 성공
Chrome 꺼짐 -> waiting_runtime
Sellpia login 만료 -> attention_required, focus 없음
retry -> 새 attempt, stale report 409
~~~

- [ ] **Step 6: 커밋**

~~~bash
rtk git add apps/server/src/inventory apps/web/src/hooks apps/web/src/components/providers apps/web/src/lib/sellpia-inventory-extension.ts extensions
rtk git commit -m "refactor: run sellpia inventory through browser operations"
~~~

## Task 12: 예약 주문 전체수집의 durable artifact 전환 (수동 버튼과 별도)

**Files:**
- Modify: prisma/models/orders.prisma, prisma/models/core.prisma
- Create: packages/shared/src/schemas/order-collection-operation.ts
- Create: packages/shared/src/order-collection-operation.ts
- Create: apps/server/src/orders/domain/operation/orders.operations.ts
- Create: apps/server/src/orders/application/port/in/order-collection-operation.port.ts
- Create: apps/server/src/orders/adapter/in/operation/collect-all-malls.operation-handler.ts
- Create: apps/server/src/orders/adapter/in/http/order-collection-artifacts.controller.ts
- Create: apps/server/src/orders/adapter/out/repository/order-collection-artifact.repository.adapter.ts
- Create: apps/server/src/orders/application/service/__tests__/order-collection-operation.service.spec.ts
- Modify: apps/server/src/orders/orders.module.ts
- Modify: apps/web/src/app/(orders)/order-collection/lib/order-collection-api.ts
- Modify: apps/web/src/app/(orders)/order-collection/lib/order-generated-file-store.ts
- Modify: apps/web/src/app/(orders)/order-collection/components/OrderCollectionWorkspace.tsx
- Modify: apps/web/src/app/(orders)/order-collection/components/GeneratedFilesSection.tsx
- Modify: extensions/kiditem-os/background/orders/worker.js

- [ ] **Step 1: fan-out 실패 테스트**

~~~typescript
await handler.execute(parentContext);
expect(operationRunner.startChild).toHaveBeenCalledTimes(2);
expect(operationRunner.startChild).toHaveBeenCalledWith(expect.objectContaining({
  operationKey: 'orders.collect_mall',
  parentRunId: parentContext.runId,
}));
~~~

- [ ] **Step 2: OrderCollectionArtifact model 추가**

organizationId, parent/child operationRunId, mallAccountId, fileName, mediaType, storageKey, sha256, rowCount, createdAt을 저장한다. bytes는 StorageService에 저장하고 Operation result에는 artifact ID/count만 둔다.

- [ ] **Step 3: composite handler 구현**

enabled/collectable mall마다 child run을 만든다. child 모두 terminal이면 parent result는 total, succeeded, failed, failedMallAccountIds, artifactIds를 가진다. 하나 이상 성공은 succeeded+warningCount, 전부 실패는 failed다.

- [ ] **Step 4: domain artifact upload endpoint 구현**

POST /api/orders/collection-runs/:runId/artifacts는 size/hash/mall ownership/attemptToken을 검증한다. generic browser report에는 base64/file rows를 허용하지 않는다.

- [ ] **Step 5: 예약 결과 조회 연결**

예약 전체수집은 parent OperationRun과 서버 artifact를 만든다. 수동 전체수집과 실패 몰 재수집은 기존 화면과 대시보드가 공유하는 browser action을 유지하며 IndexedDB 생성 파일 history를 보존한다. 예약 artifact가 준비되기 전까지 수동 결과를 count-only Operation으로 바꾸지 않는다.

- [ ] **Step 6: 검증과 커밋**

Run: rtk npm run db:push && rtk npx prisma generate && rtk npm run build --workspace=packages/shared && rtk npm exec --workspace=apps/server vitest -- run src/orders src/operations && rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/order-collection' && rtk node --test extensions/tests/order-collector-*.test.mjs

Expected: PASS.

~~~bash
rtk git add prisma packages/shared apps/server/src/orders apps/server/src/operations apps/web/src/app/'(orders)'/order-collection extensions
rtk git commit -m "refactor: unify scheduled mall order collection"
~~~

## Task 13: shipment, 광고, catalog schedule 전환

**Files:**
- Create: apps/server/src/inventory/adapter/in/operation/coupang-shipments.operation-handler.ts
- Modify: apps/server/src/inventory/domain/operation/inventory.operations.ts
- Create: apps/server/src/advertising/domain/operation/advertising.operations.ts
- Create: apps/server/src/advertising/adapter/in/operation/advertising-daily-facts.operation-handler.ts
- Create: apps/server/src/channels/domain/operation/channels.operations.ts
- Create: apps/server/src/channels/adapter/in/operation/coupang-catalog.operation-handler.ts
- Modify: apps/server/src/inventory/inventory.module.ts
- Modify: apps/server/src/advertising/advertising.module.ts
- Modify: apps/server/src/channels/channels.module.ts
- Modify: apps/web/src/app/(inventory)/coupang-shipments/page.tsx
- Modify: apps/web/src/app/(inventory)/coupang-shipments/hooks/useCoupangShipmentViewState.ts
- Modify: apps/web/src/app/(inventory)/coupang-shipments/lib/coupang-shipment-api.ts
- Modify: apps/web/src/app/(inventory)/coupang-shipments/lib/coupang-shipment-extension.ts
- Modify: apps/web/src/app/(inventory)/coupang-shipments/lib/coupang-shipment-store.ts
- Modify: extensions/kiditem-os/background/coupang/worker.js
- Modify: extensions/kiditem-os/background/orders/worker.js
- Modify: extensions/kiditem-os/background/sourcing/worker.js
- Modify: extensions/tests/order-collector-coupang-shipment-summary.test.mjs
- Modify: extensions/tests/coupang-ads-scraper/collection-runs.test.mjs
- Modify: extensions/tests/coupang-ads-scraper/ads-report.test.mjs
- Modify: extensions/tests/coupang-catalog-action-coverage.test.mjs

- [ ] **Step 1: owner manifest tests**

각 definition의 exact key, owner prefix, engine, scheduleSupported, input schema를 검증한다. shipment date가 없으면 server가 조직 timezone 기준 오늘을 계산한다.

- [ ] **Step 2: shipment sink 전환**

merge logic은 순수 helper로 server owner capability에 둔다. 확장은 허용된 file만 Inventory ingest endpoint에 올리고 화면 IndexedDB는 다운로드 캐시만 유지한다.

- [ ] **Step 3: business alarms 제거**

auto-scrape, keyword-rank-check, coupang-keyword-serp-rank, Sellpia sales periodic collection alarm을 OperationSchedule로 교체한다. storage-cleanup, in-flight resume, generic runtime wake alarm은 유지한다.

- [ ] **Step 4: sourcing composite에 browser child 연결**

sourcing.collect_daily_trends가 요청 sources에 따라 sourcing.collect_1688_trends, sourcing.collect_live_commerce_trends, sourcing.collect_tiktok_cc_trends child를 만든다. 각 child는 sourcing worker의 기존 collector를 exact operation handler로 등록하고, 결과는 기존 sourcing ingest controller를 통해 저장한다.

- [ ] **Step 5: catalog native run 연결**

channels.import_coupang_catalog를 기존 account-scoped catalog import run에 연결하여 chunk/finalize completeness와 attempt fence를 보존한다.

- [ ] **Step 6: 예약 producer 연결**

Shipment, advertising, channel catalog의 예약 producer는 Operations를 사용한다. 수동 Shipment/Rocket 버튼은 대시보드와 기존 화면이 공유하는 browser action을 유지한다. interactive-only registration/edit/upload는 schedule 대상에서 제외한다.

- [ ] **Step 7: alarm regression test**

~~~javascript
assert.equal(source.includes('auto-scrape'), false);
assert.equal(source.includes('keyword-rank-check'), false);
assert.equal(source.includes('periodInMinutes: 360'), false);
assert.equal(source.includes('kiditem-operation-runtime-claim'), true);
~~~

- [ ] **Step 8: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/inventory src/advertising src/channels src/operations && rtk npm run build --workspace=apps/server && rtk npm run build --workspace=apps/web && rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs

Expected: PASS.

~~~bash
rtk git add apps/server/src/inventory apps/server/src/advertising apps/server/src/channels apps/server/src/operations apps/web extensions
rtk git commit -m "refactor: move browser business schedules to operations"
~~~

## Task 14: Workflow, Agent OS, AI native run 연결

**Files:**
- Create: apps/server/src/automation/adapter/in/operation/workflow.operation-handler.ts
- Create: apps/server/src/automation/adapter/out/operations/workflow-operation-finalization.adapter.ts
- Create: apps/server/src/agent-os/adapter/in/operation/agent.operation-handler.ts
- Create: apps/server/src/agent-os/adapter/out/operations/agent-operation-finalization.adapter.ts
- Create: apps/server/src/ai/adapter/in/operation/ai-direct.operation-handler.ts
- Create: apps/server/src/ai/adapter/out/operations/ai-direct-operation-finalization.adapter.ts
- Modify: apps/server/src/automation/automation.module.ts
- Modify: apps/server/src/agent-os/agent-os.module.ts
- Modify: apps/server/src/ai/ai.module.ts
- Modify: apps/server/src/agent-os/application/service/agent-os-mcp-tool-executor.service.ts
- Modify: apps/server/src/operation-cancellation/application/service/operation-cancellation.service.ts
- Modify: apps/server/src/operation-cancellation/adapter/in/http/operation-cancellation.controller.ts
- Modify: apps/server/src/operation-cancellation/operation-cancellation.module.ts
- Modify: apps/server/src/operation-cancellation/application/service/__tests__/operation-cancellation.service.spec.ts
- Modify: apps/server/src/operation-cancellation/adapter/in/http/__tests__/operation-cancellation.controller.spec.ts

- [ ] **Step 1: dependency direction tests**

~~~typescript
expect(automationImportsAgentOs()).toBe(false);
expect(agentOsImportsOperationsPort()).toBe(true);
expect(operationsImportsConcreteOwnerService()).toBe(false);
~~~

- [ ] **Step 2: native delegation 구현**

~~~typescript
return {
  kind: 'delegated',
  nativeRunType: 'agent_run_request',
  nativeRunId: request.id,
};
~~~

Workflow는 workflow_run, Agent OS는 agent_run_request, AI는 ai_direct_job을 사용한다. Native owner terminal event가 organization/native ref로 OperationRun을 정확히 한 번 terminalize한다.
Agent OS definition에 필요한 model이 없으면 기존 계약대로 명시적 runtime_not_configured 실패를 기록하며 silent model fallback을 추가하지 않는다.

- [ ] **Step 3: Agent deterministic child tool 추가**

operation_run MCP tool은 allowedTriggers에 agent가 있는 definition만 노출한다. Agent tool invocation ID를 idempotency key에 포함하고 현재 AgentRun provenance를 남긴다. Automation에는 이 tool을 노출하지 않는다.

- [ ] **Step 4: engine boundary tests**

~~~text
ai.generate_product_content -> AiDirectJob, no AgentRunRequest
sourcing.recommend_products -> AgentRunRequest, no WorkflowRun
automation workflow -> WorkflowRun, no AgentRunRequest
Agent deterministic child -> one OperationRun and one owner invocation
~~~

- [ ] **Step 5: cancellation 재구성**

POST /api/operations/runs/:runId/cancel이 run을 조직 범위로 읽고 handler 또는 native cancellation port를 호출한다. 기존 POST /api/operations/cancel은 새 service에 위임한다.

- [ ] **Step 6: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/operations src/automation src/agent-os src/ai src/operation-cancellation

Expected: PASS; automation-agent-os boundary remains green.

~~~bash
rtk git add apps/server/src/operations apps/server/src/automation apps/server/src/agent-os apps/server/src/ai apps/server/src/operation-cancellation
rtk git commit -m "feat: link native engines to operation runs"
~~~

## Task 15: panel projection과 Agent OS 관측 통합

**Files:**
- Modify: packages/shared/src/panel/sources.ts, packages/shared/src/panel/types.ts
- Create: apps/server/src/operations/adapter/out/panel/operation-panel.mapper.ts
- Create: apps/server/src/operations/adapter/out/panel/__tests__/operation-panel.mapper.spec.ts
- Modify: apps/server/src/automation/adapter/out/panel-event/panel.service.ts
- Modify: apps/server/src/automation/adapter/out/panel-event/panel-sse.service.ts
- Modify: apps/server/src/automation/adapter/out/panel-event/__tests__/panel.service.spec.ts
- Modify: apps/web/src/components/panel/PanelItemRow.tsx
- Modify: apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx

- [ ] **Step 1: status mapping 실패 test**

~~~typescript
expect(mapOperationRun(run({ status: 'waiting_runtime' }))).toMatchObject({
  kind: 'run',
  source: 'operation',
  status: 'pending',
  subtitle: '브라우저 연결 대기',
});
expect(mapOperationRun(run({ status: 'attention_required' }))).toMatchObject({
  phase: 'attention_required',
  subtitle: '확인 필요',
});
~~~

- [ ] **Step 2: shared panel source 추가**

~~~typescript
operation: {
  label: '운영 실행',
  iconName: 'Activity',
  deepLinkPattern: '/dashboard?tab=agent-os&operationRunId=:id',
},
~~~

PanelRunItem wire status는 기존 호환 값을 유지하고 Operation 세부 상태는 phase에 둔다.

- [ ] **Step 3: snapshot dedupe 구현**

최근 24시간 또는 active OperationRun을 읽는다. 아직 감싸지지 않은 legacy workflow/image만 보충하고 native ref가 OperationRun에 연결된 row는 중복 표시하지 않는다.

- [ ] **Step 4: SSE upsert 연결**

Operation transition 후 operation.run.changed를 발행하고 adapter가 기존 PANEL_EVENTS.UPSERT로 변환한다. Panel은 read-only projection을 유지한다.

- [ ] **Step 5: 검증과 커밋**

Run: rtk npm exec --workspace=apps/server vitest -- run src/automation/adapter/out/panel-event src/operations/adapter/out/panel && rtk npm exec --workspace=apps/web vitest -- run src/components/panel 'src/app/(analytics)/dashboard'

Expected: PASS.

~~~bash
rtk git add packages/shared/src/panel apps/server/src/automation apps/server/src/operations apps/web/src/components/panel apps/web/src/app/'(analytics)'/dashboard
rtk git commit -m "feat: project unified operation runs into agent os"
~~~

## Task 16: capability drift 정리와 legacy 제거

**Files:**
- Create: apps/server/src/common/__tests__/operation-capability-catalog.spec.ts
- Modify: apps/server/src/ai/domain/capability/ai.capabilities.ts
- Modify: apps/server/src/sourcing/domain/capability/sourcing.capabilities.ts
- Create: apps/server/src/supply/domain/capability/supply.capabilities.ts
- Modify: apps/server/src/agent-os/application/service/kiditem-mcp-tool-registry.service.ts
- Delete: apps/server/src/automation/application/service/browser-collection-run-id.service.ts
- Delete: apps/server/src/automation/adapter/in/http/browser-collection-run-id.controller.ts
- Delete: apps/server/src/automation/application/service/__tests__/browser-collection-run-id.service.spec.ts
- Delete: apps/server/src/automation/adapter/in/http/__tests__/browser-collection-run-id.controller.spec.ts
- Modify: apps/server/src/automation/automation.module.ts
- Modify: apps/web/src/lib/browser-collection-session.ts
- Modify: apps/web/src/components/providers/BrowserCollectionProvider.tsx
- Modify: apps/web/src/hooks/useSellpiaChannelSales.ts
- Modify: apps/web/src/app/(automation)/workflows/components/WorkflowList.tsx
- Modify: apps/web/src/app/(automation)/workflows/hooks/useWorkflows.ts
- Modify: apps/web/src/app/(automation)/workflows/lib/workflow-api.ts
- Modify: apps/web/src/app/(automation)/workflows/lib/workflow-api.spec.ts
- Modify: docs/ARCHITECTURE.md
- Modify: docs/runbooks/deployment-architecture.md
- Modify: docs/runbooks/environment-variables.md
- Modify: docker-compose.staging.yml, docker-compose.production.yml
- Modify: deploy/office/compose.office.yml

- [ ] **Step 1: catalog consistency test 작성**

~~~text
capability key prefix equals ownerDomain
runtime handler key resolves to one capability manifest
operation key prefix equals ownerDomain
operation owner exists in owner map
operation capability references resolve
browser operation key has one extension handler
workflow UI never maps succeeded as completed
~~~

- [ ] **Step 2: canonical capability keys로 전환**

~~~text
product_listing.submit_wing_thumbnail -> ai.submit_wing_thumbnail
market.collect_keyword_category_rankings -> sourcing.collect_keyword_category_rankings
market.collect_shadow_signals -> sourcing.collect_shadow_signals
coupang.match_products -> sourcing.match_coupang_products
coupang.collect_tracking_snapshot -> sourcing.collect_coupang_tracking_snapshot
supplier1688.match_products -> sourcing.match_supplier1688_products
product_listing.create_generation_package -> sourcing.create_listing_generation_package
~~~

MCP allowlist, handlers, Agent policy fixtures를 같은 commit에서 갱신하고 legacy alias는 만들지 않는다. Supply runtime handlers는 supply.capabilities.ts에 선언한다.

- [ ] **Step 3: UUID-only route와 web alert flush 제거**

모든 browser producer가 OperationRun을 사용한다는 test가 green인 상태에서 /api/browser-collection-runs, issueBrowserCollectionRunId, web-mounted alert lifecycle flush를 삭제한다. BrowserCollectionProvider는 attention open/retry bridge만 남기거나 consumer가 없으면 삭제한다.

- [ ] **Step 4: workflow schedule 표시 교정**

Workflow schedule을 schedule-capable workflow Operation으로 연결한다. /workflows UI는 동작하지 않는 badge 대신 연결된 OperationSchedule의 enabled/nextRunAt을 표시하고 status는 succeeded를 사용한다.

- [ ] **Step 5: worker deployment env 활성화**

세 worker compose environment에 다음만 추가한다.

~~~yaml
OPERATION_RUNTIME_WORKER_ENABLED: "1"
OPERATION_SCHEDULER_ENABLED: "1"
~~~

API service에는 추가하지 않는다. Deployment architecture에 API/worker 분리와 SKIP LOCKED 다중 worker 안전성을 기록한다.

- [ ] **Step 6: legacy absence tests**

~~~text
no /api/browser-collection-runs consumer
no business chrome alarm names
no silent Sellpia scheduled failure catch
no dashboard cross-route execution import
no panel comment saying AgentRun wiring is absent
no workflow completed status string
~~~

- [ ] **Step 7: 전체 verification**

~~~bash
rtk npm run check:conventions
rtk npm run test:scripts
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/operations src/automation src/agent-os src/ai src/sourcing src/inventory src/orders src/advertising src/channels src/supply
rtk npm run test:integration --workspace=apps/server -- src/operations
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npx vitest run
rtk node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
rtk node extensions/scripts/sync-collection-session-adapters.mjs --check
rtk node --check extensions/kiditem-os/background/service-worker.js
rtk git diff --check
~~~

Expected: every command PASS.

- [ ] **Step 8: backend boot**

Run: rtk npm run dev:server

Expected: Nest boots without unresolved provider or circular dependency. API process logs operation worker/scheduler disabled unless env is enabled.

- [ ] **Step 9: end-to-end acceptance**

| Scenario | Expected |
|---|---|
| Dashboard trend button | one OperationRun, sourcing handler once |
| Sourcing screen same action | same definition/handler, domain_screen source |
| Dashboard mall-order button | same shared collector/session/file persistence as order screen |
| Dashboard shipment button | same validated extension command and persisted summary as shipment screen |
| Dashboard Rocket button | same collection/catalog-save command as Rocket screen |
| Agent deterministic collect | child OperationRun, no duplicate logic |
| Daily schedule | derived idempotency key, one run across workers |
| Chrome offline | waiting_runtime visible in Agent OS |
| Chrome reconnect | claim/progress/terminal under same run |
| Login expired | attention_required, no focus |
| Cancel parent order run | active children cancelled, completed artifacts kept |
| Server restart | schedule and leases recover |
| Other organization reads run | 404 |
| Duplicate API request | same run |
| Stale browser report | 409, result unchanged |
| Native engine completion | linked OperationRun terminalized once |

- [ ] **Step 10: PR and release gates**

~~~bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
~~~

PR Release decision:

~~~text
Keep VERSION 0.1.30. Apply compatible schema additions with npm run db:push.
No backfill and no versioned data migration. Enable operation worker/scheduler
only in worker services after schema and application image deployment.
~~~

- [ ] **Step 11: 최종 커밋**

~~~bash
rtk git add apps packages prisma extensions docs docker-compose.staging.yml docker-compose.production.yml deploy/office/compose.office.yml package-lock.json
rtk git commit -m "refactor: complete unified operation control plane"
~~~

## 완료 조건

- 대시보드 Agent OS와 개별 업무 화면의 수동 버튼이 동일 shared action을 사용한다.
- Agent와 schedule은 Operations를 통해 동일 owner capability를 사용한다.
- Automation, Agent OS, AI direct job, browser native ledger는 유지되고 OperationRun에 연결된다.
- 서버 예약이 business schedule의 유일한 source of truth다.
- extension 업무 alarm과 web-mounted silent flush가 제거된다.
- browser offline/login/CAPTCHA가 waiting_runtime 또는 attention_required로 보인다.
- 예약 결과 파일은 server/domain storage에서 조회할 수 있다. 수동 주문 화면의 기존 IndexedDB 생성 파일 history는 UI 계약으로 유지한다.
- cancel/retry/idempotency/lease fencing/tenant isolation이 integration test로 증명된다.
- Agent OS 명칭과 대시보드 상위 UI가 유지된다.
- Capability와 Operation catalog scanner가 오류 0건이다.
- backend boot, frontend/shared build, schema/ERD, extension tests가 통과한다.

## 실행 순서와 rollback

Task 1–9는 server-only pilot 배포 단위다. 이 시점에는 extension 업무 alarm을 제거하지 않는다. Task 10–13은 browser runtime과 owner별 cutover 단위이며 Operation key별로 전환한다. Task 14–16은 native engine projection과 legacy 제거 단위다.

Rollback은 schema를 삭제하지 않고 consumer를 이전 endpoint로 되돌리는 방식으로 한다. 각 Operation key의 새 producer를 끄고 기존 직접 경로를 다시 켤 수 있는 기간은 해당 key의 end-to-end acceptance 완료 시점까지다. Legacy 삭제 이후에는 DB ledger를 보존한 채 application image만 직전 digest로 rollback한다.
