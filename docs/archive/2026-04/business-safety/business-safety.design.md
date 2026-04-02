# Business Safety Layer Design — receiveResults 미들웨어 패턴

> Selected: **Option A — receiveResults 미들웨어**. completeTask() 전에 검증 레이어 삽입. 모든 도메인 콜백에 자동 적용.

## Context Anchor

| Anchor | Content |
|--------|---------|
| **WHY** | 에이전트 안전장치가 프롬프트에만 존재. AI가 무시하면 서버가 차단 못함. 실제 돈이 움직이는데 서버 레벨 보호 없음 |
| **WHO** | 모든 에이전트 (활성+비활성+Python+미래). 모든 셀러 |
| **RISK** | 검증 오버헤드, 스냅샷 데이터 증가, 과도한 제한이 유용성 저하 |
| **SUCCESS** | 모든 결과가 ActionCap 통과. DryRunGate 졸업제. 스냅샷 롤백 가능 |
| **SCOPE** | agent-registry + 도메인 콜백. Frontend 최소. Python 변경 없음 |

---

## 1. Overview

### 1.1 핵심 흐름 (Before → After)

```
Before:
  에이전트 결과 → receiveResults() → completeTask() → 도메인 후처리 → 끝
                  (검증 없음)

After:
  에이전트 결과 → receiveResults()
                    → [1. DryRunGate]  trustLevel 확인, dry_run 강제 여부
                    → [2. ActionCap]   금액/수량 상한 검증
                    → [3. Snapshot]    변경 전 데이터 백업
                    → completeTask()   (기존)
                    → 도메인 후처리     (기존)
                    → [4. PostVerify]  verification wakeup 예약
```

### 1.2 Module 위치

```
apps/server/src/agent-registry/
├── business-safety/                    ← NEW MODULE
│   ├── business-safety.module.ts
│   ├── action-cap.service.ts           ← BS-1: 금액/수량 상한 검증
│   ├── dry-run-gate.service.ts         ← BS-4: 졸업 제도
│   ├── snapshot.service.ts             ← BS-3: 실행 전 스냅샷
│   ├── post-verification.service.ts    ← BS-6: 사후 검증
│   ├── safety-pipeline.service.ts      ← 파이프라인 오케스트레이터
│   └── __tests__/
│       ├── action-cap.service.spec.ts
│       ├── dry-run-gate.service.spec.ts
│       ├── snapshot.service.spec.ts
│       └── safety-pipeline.service.spec.ts
│
├── agent-registry.service.ts           ← Modify: completeTask 전에 pipeline 호출
├── seed-agents.ts                      ← Modify: actionCap + trustLevel 설정
└── events/agent-events.ts              ← Modify: 신규 이벤트 추가
```

---

## 2. Schema Changes

### 2.1 AgentDefinition 확장

```prisma
model AgentDefinition {
  // ... 기존 필드 ...

  // Business Safety
  actionCap  Json @default("{}") @map("action_cap") @db.JsonB
  trustLevel Int  @default(0) @map("trust_level")   // 0=dry-run강제, 1=실행허용, 2=스케줄실행
}
```

### 2.2 AgentActionSnapshot (신규)

```prisma
model AgentActionSnapshot {
  id          String    @id @default(uuid()) @db.Uuid
  companyId   String    @map("company_id") @db.Uuid
  runId       String    @map("run_id") @db.Uuid
  agentId     String    @map("agent_id") @db.Uuid
  tableName   String    @map("table_name")
  recordId    String    @map("record_id")
  fieldName   String    @map("field_name")
  valueBefore Json      @map("value_before")
  valueAfter  Json      @map("value_after")
  restoredAt  DateTime? @map("restored_at") @db.Timestamptz
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz

  agent   AgentDefinition @relation(fields: [agentId], references: [id])
  company Company         @relation(fields: [companyId], references: [id])

  @@index([runId])
  @@index([agentId, createdAt])
  @@map("agent_action_snapshots")
}
```

---

## 3. Safety Pipeline

### 3.1 safety-pipeline.service.ts

모든 Business Safety 컴포넌트를 순서대로 실행하는 오케스트레이터.

```typescript
@Injectable()
export class SafetyPipelineService {
  constructor(
    private readonly dryRunGate: DryRunGateService,
    private readonly actionCap: ActionCapService,
    private readonly snapshot: SnapshotService,
    private readonly postVerification: PostVerificationService,
  ) {}

  /**
   * 에이전트 결과를 실행하기 전에 검증하는 파이프라인.
   * completeTask() 전에 호출됨.
   */
  async validate(context: {
    agentDef: AgentDefinition;
    taskId: string;
    runId?: string;
    companyId: string;
    body: { actions?: any[]; dry_run?: boolean; [key: string]: unknown };
  }): Promise<SafetyResult> {
    const result: SafetyResult = {
      allowed: true,
      dryRunForced: false,
      blockedActions: [],
      snapshots: [],
    };

    // 1. DryRunGate — trustLevel에 따라 dry_run 강제
    const gateResult = this.dryRunGate.check(context.agentDef, context.body.dry_run);
    if (gateResult.forced) {
      result.dryRunForced = true;
      context.body.dry_run = true;
    }

    // dry_run이면 ActionCap/Snapshot 불필요 (판단만)
    if (context.body.dry_run) {
      return result;
    }

    // 2. ActionCap — 각 action의 금액/수량 검증
    if (context.body.actions?.length) {
      const capResult = this.actionCap.validate(
        context.agentDef,
        context.body.actions,
      );
      result.blockedActions = capResult.blocked;
      if (capResult.blocked.length > 0) {
        // 위반 항목 제거, 나머지만 실행
        context.body.actions = capResult.allowed;
      }
      if (capResult.allBlocked) {
        result.allowed = false;
        return result;
      }
    }

    // 3. Snapshot — 변경 대상 레코드 백업
    if (context.body.actions?.length) {
      result.snapshots = await this.snapshot.capture(context);
    }

    return result;
  }

  /**
   * 실행 완료 후 PostVerification 예약.
   */
  async scheduleVerification(context: {
    agentDef: AgentDefinition;
    runId: string;
    companyId: string;
  }): Promise<void> {
    if (context.agentDef.trustLevel >= 1) {
      await this.postVerification.schedule(context);
    }
  }
}

interface SafetyResult {
  allowed: boolean;
  dryRunForced: boolean;
  blockedActions: BlockedAction[];
  snapshots: SnapshotRecord[];
}
```

---

## 4. Component Design

### 4.1 ActionCapService (BS-1 + BS-2)

```typescript
@Injectable()
export class ActionCapService {
  validate(
    agentDef: AgentDefinition,
    actions: any[],
  ): { allowed: any[]; blocked: BlockedAction[]; allBlocked: boolean } {
    const cap = (agentDef.actionCap as ActionCapConfig) || {};
    const allowed: any[] = [];
    const blocked: BlockedAction[] = [];

    // BS-2: BlastRadius — 전체 수량 제한
    if (cap.maxAffectedProducts && actions.length > cap.maxAffectedProducts) {
      return {
        allowed: [],
        blocked: [{ reason: 'blast_radius', detail: `${actions.length} > ${cap.maxAffectedProducts}` }],
        allBlocked: true,
      };
    }

    for (const action of actions) {
      const violation = this.checkSingleAction(cap, action);
      if (violation) {
        blocked.push(violation);
      } else {
        allowed.push(action);
      }
    }

    return { allowed, blocked, allBlocked: allowed.length === 0 && blocked.length > 0 };
  }

  private checkSingleAction(cap: ActionCapConfig, action: any): BlockedAction | null {
    // 예산 변경 % 검증
    if (cap.maxBudgetChangePct && action.budgetChangePct) {
      if (Math.abs(action.budgetChangePct) > cap.maxBudgetChangePct) {
        return {
          reason: 'budget_change_exceeded',
          detail: `${action.budgetChangePct}% > ±${cap.maxBudgetChangePct}%`,
          action,
        };
      }
    }

    // 가격 변경 % 검증
    if (cap.maxPriceChangePct && action.priceChangePct) {
      if (Math.abs(action.priceChangePct) > cap.maxPriceChangePct) {
        return {
          reason: 'price_change_exceeded',
          detail: `${action.priceChangePct}% > ±${cap.maxPriceChangePct}%`,
          action,
        };
      }
    }

    // 일일 지출 상한
    if (cap.dailySpendLimit && action.newDailyBudget) {
      if (action.newDailyBudget > cap.dailySpendLimit) {
        return {
          reason: 'daily_spend_exceeded',
          detail: `₩${action.newDailyBudget} > ₩${cap.dailySpendLimit}`,
          action,
        };
      }
    }

    // 발주 금액 상한
    if (cap.maxOrderAmount && action.orderAmount) {
      if (action.orderAmount > cap.maxOrderAmount) {
        return {
          reason: 'order_amount_exceeded',
          detail: `₩${action.orderAmount} > ₩${cap.maxOrderAmount}`,
          action,
        };
      }
    }

    return null;
  }
}

interface ActionCapConfig {
  maxBudgetChangePct?: number;
  maxPriceChangePct?: number;
  maxAffectedProducts?: number;
  dailySpendLimit?: number;
  maxOrderAmount?: number;
}

interface BlockedAction {
  reason: string;
  detail: string;
  action?: any;
}
```

### 4.2 DryRunGateService (BS-4)

```typescript
@Injectable()
export class DryRunGateService {
  private readonly logger = new Logger(DryRunGateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * trustLevel에 따라 dry_run 강제 여부 결정.
   */
  check(agentDef: AgentDefinition, requestedDryRun?: boolean): { forced: boolean; reason?: string } {
    const trustLevel = (agentDef as any).trustLevel ?? 0;

    if (trustLevel === 0 && requestedDryRun === false) {
      this.logger.warn(`DryRunGate: ${agentDef.name} trustLevel=0, forcing dry_run=true`);
      return { forced: true, reason: `trustLevel=0, dry-run 강제` };
    }

    return { forced: false };
  }

  /**
   * 에이전트 실행 성공/실패에 따라 trustLevel 자동 조정.
   * HeartbeatService 실행 완료 후 호출.
   */
  async adjustTrust(agentId: string, success: boolean): Promise<void> {
    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) return;

    const trustLevel = (agent as any).trustLevel ?? 0;
    const runtimeState = await this.prisma.agentRuntimeState.findUnique({ where: { agentId } });
    const successCount = runtimeState ? (runtimeState.stateJson as any)?.successCount ?? 0 : 0;
    const failStreak = runtimeState?.consecutiveFailCount ?? 0;

    let newTrustLevel = trustLevel;

    if (success) {
      const newSuccessCount = successCount + 1;
      // 승격 조건
      if (trustLevel === 0 && newSuccessCount >= 5) newTrustLevel = 1;
      if (trustLevel === 1 && newSuccessCount >= 20) newTrustLevel = 2;

      await this.prisma.agentRuntimeState.update({
        where: { agentId },
        data: { stateJson: { ...(runtimeState?.stateJson as any), successCount: newSuccessCount } },
      });
    } else {
      // 강등 조건: 연속 2회 실패
      if (failStreak >= 2 && trustLevel > 0) {
        newTrustLevel = trustLevel - 1;
      }
    }

    if (newTrustLevel !== trustLevel) {
      await this.prisma.agentDefinition.update({
        where: { id: agentId },
        data: { trustLevel: newTrustLevel } as any,
      });
      this.logger.log(`TrustLevel changed: ${agent.name} ${trustLevel} → ${newTrustLevel}`);
    }
  }
}
```

### 4.3 SnapshotService (BS-3)

```typescript
@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 에이전트 결과의 actions에서 영향받는 레코드의 현재 값을 스냅샷.
   */
  async capture(context: {
    agentDef: AgentDefinition;
    runId?: string;
    companyId: string;
    body: { actions?: any[] };
  }): Promise<SnapshotRecord[]> {
    const actions = context.body.actions || [];
    const snapshots: SnapshotRecord[] = [];

    for (const action of actions) {
      if (!action.product_id) continue;

      // 상품의 현재 값 조회
      const product = await this.prisma.product.findUnique({
        where: { id: action.product_id },
        select: {
          id: true,
          adBudgetLimit: true,
          adTier: true,
          sellPrice: true,
          costPrice: true,
          healthScore: true,
        },
      });
      if (!product) continue;

      // action 유형에 따라 스냅샷 필드 결정
      const fields = this.getSnapshotFields(action);
      for (const field of fields) {
        const snapshot = {
          companyId: context.companyId,
          runId: context.runId ?? '',
          agentId: context.agentDef.id,
          tableName: 'products',
          recordId: product.id,
          fieldName: field,
          valueBefore: (product as any)[field],
          valueAfter: action[`new_${field}`] ?? action[field] ?? null,
        };
        snapshots.push(snapshot);
      }
    }

    // 배치 저장
    if (snapshots.length > 0) {
      await this.prisma.agentActionSnapshot.createMany({ data: snapshots as any });
    }

    return snapshots;
  }

  /**
   * 특정 run의 변경 사항을 롤백.
   */
  async rollback(runId: string): Promise<{ restored: number }> {
    const snapshots = await this.prisma.agentActionSnapshot.findMany({
      where: { runId, restoredAt: null },
      orderBy: { createdAt: 'desc' },
    });

    let restored = 0;
    for (const snap of snapshots) {
      await this.prisma.product.update({
        where: { id: snap.recordId },
        data: { [snap.fieldName]: snap.valueBefore },
      });
      await this.prisma.agentActionSnapshot.update({
        where: { id: snap.id },
        data: { restoredAt: new Date() },
      });
      restored++;
    }

    return { restored };
  }

  private getSnapshotFields(action: any): string[] {
    switch (action.action) {
      case 'increase_budget':
      case 'decrease_budget':
      case 'minimize_budget':
        return ['adBudgetLimit'];
      case 'stop_ad':
        return ['adTier', 'adBudgetLimit'];
      case 'change_price':
        return ['sellPrice'];
      default:
        return [];
    }
  }
}
```

### 4.4 PostVerificationService (BS-6)

```typescript
@Injectable()
export class PostVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wakeupService: WakeupService,
  ) {}

  /**
   * 실행 24시간 후 verification wakeup 예약.
   */
  async schedule(context: {
    agentDef: AgentDefinition;
    runId: string;
    companyId: string;
  }): Promise<void> {
    await this.wakeupService.requestWakeup({
      agentId: context.agentDef.id,
      companyId: context.companyId,
      source: 'automation',
      reason: `PostVerification for run ${context.runId}`,
      triggerDetail: `verify:${context.runId}`,
      payload: {
        _verification: true,
        _originalRunId: context.runId,
        _scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  }
}
```

---

## 5. Integration Point: agent-registry.service.ts

```typescript
// receiveResults() 수정 — completeTask() 전에 Safety Pipeline 삽입

async receiveResults(taskId: string, body: any): Promise<{ ok: boolean }> {
  const task = await this.prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundException(`Task ${taskId} not found`);

  const input = task.input as any;
  const agentDef = input?.definitionId
    ? await this.prisma.agentDefinition.findUnique({ where: { id: input.definitionId } })
    : null;

  // ── Business Safety Pipeline ──
  if (agentDef && this.safetyPipeline) {
    const safety = await this.safetyPipeline.validate({
      agentDef,
      taskId,
      runId: input?._run_id,
      companyId: task.companyId ?? '',
      body,
    });

    if (!safety.allowed) {
      // 전체 차단 — 완료 처리하지 않음
      await this.prisma.agentTask.update({
        where: { id: taskId },
        data: { status: 'blocked', error: `ActionCap violation: ${safety.blockedActions.map(b => b.reason).join(', ')}` },
      });
      return { ok: false, error: 'action_cap_violated' } as any;
    }

    if (safety.dryRunForced) {
      body.dry_run = true;
    }
  }

  // 기존 흐름
  const completedTask = await this.completeTask(taskId, body);

  // ... 기존 도메인 후처리 ...

  // ── PostVerification 예약 ──
  if (agentDef && this.safetyPipeline && !body.dry_run) {
    await this.safetyPipeline.scheduleVerification({
      agentDef,
      runId: input?._run_id ?? taskId,
      companyId: task.companyId ?? '',
    });
  }

  return { ok: true };
}
```

---

## 6. Seed Agents — actionCap + trustLevel

```typescript
// seed-agents.ts

{
  name: '광고 전략 에이전트',
  type: 'ad_strategy',
  trustLevel: 2,  // 기존 운영 중 → 신뢰됨
  actionCap: {
    maxBudgetChangePct: 30,
    maxAffectedProducts: 50,
    dailySpendLimit: 500000,
  },
  // ...
},
{
  name: '건강도 평가 에이전트',
  type: 'rules_evaluation',
  trustLevel: 2,
  actionCap: {},  // 읽기+healthScore UPDATE → 금액 상한 불필요
  // ...
},
{
  name: '가격 조정 에이전트',
  type: 'pricing',
  trustLevel: 0,  // 비활성 → 신규 → dry-run 강제
  actionCap: {
    maxPriceChangePct: 20,
    maxAffectedProducts: 30,
  },
  // ...
},
{
  name: '재고 알림 에이전트',
  type: 'inventory_alert',
  trustLevel: 0,  // 비활성 → 신규
  actionCap: {
    maxAffectedProducts: 50,
    maxOrderAmount: 1000000,
  },
  // ...
},
```

---

## 7. Event System

```typescript
export const AGENT_EVENTS = {
  // ... 기존 ...
  ACTION_CAP_VIOLATED: 'agent.action_cap.violated',
  TRUST_LEVEL_CHANGED: 'agent.trust_level.changed',
  DRY_RUN_FORCED: 'agent.dry_run.forced',
  SNAPSHOT_CREATED: 'agent.snapshot.created',
  ROLLBACK_EXECUTED: 'agent.rollback.executed',
} as const;
```

---

## 8. API Endpoints

| Method | Path | 용도 |
|--------|------|------|
| POST | `/api/agent-registry/runs/:runId/rollback` | 스냅샷 기반 롤백 |
| GET | `/api/agent-registry/runs/:runId/snapshots` | 실행의 스냅샷 조회 |
| GET | `/api/agent-registry/runs/:runId/reasoning` | 판단 근거 조회 |
| PATCH | `/api/agent-registry/:id/trust-level` | trustLevel 수동 변경 |

---

## 9. Test Plan

| Module | Test File | Cases |
|--------|-----------|-------|
| ActionCap | `action-cap.service.spec.ts` | 상한 내 통과, % 초과 차단, blast radius 차단, cap 없는 에이전트 통과 |
| DryRunGate | `dry-run-gate.service.spec.ts` | trustLevel=0 강제, trustLevel=1 해제, 승격 5회, 강등 2연패 |
| Snapshot | `snapshot.service.spec.ts` | 캡처 생성, 롤백 복원, 빈 actions |
| Pipeline | `safety-pipeline.service.spec.ts` | dry-run 시 cap skip, 부분 차단, 전체 차단, PostVerify 예약 |

---

## 10. ReasoningLog (BS-5)

별도 서비스 불필요. 프롬프트에 reasoning 형식 지시 + 결과 JSON에서 추출.

**프롬프트 추가 (각 에이전트)**:
```
## 판단 근거 (필수)
각 action에 reasoning 필드를 포함해:
{
  "actions": [{
    "product_id": "...",
    "action": "stop_ad",
    "reason": "재고 0 + 광고 진행 중",
    "reasoning": {
      "rule": "적용된 규칙명",
      "data": { "관련 수치" },
      "confidence": 0.0~1.0
    }
  }]
}
```

**조회 API**: HeartbeatRun.resultJson에서 actions[].reasoning 추출.

---

## 11. Implementation Guide

### 11.1 Module Map

| Module | Key | Files | Dependencies |
|--------|-----|-------|-------------|
| Schema | `module-0` | `prisma/schema.prisma` | None |
| ActionCap | `module-1` | `action-cap.service.ts` + test | None |
| DryRunGate | `module-2` | `dry-run-gate.service.ts` + test | Prisma |
| Snapshot | `module-3` | `snapshot.service.ts` + test | Prisma |
| Pipeline | `module-4` | `safety-pipeline.service.ts` + module + test | module 1-3 |
| Integration | `module-5` | `agent-registry.service.ts`, controller, heartbeat | module-4 |
| Seed + Events | `module-6` | `seed-agents.ts`, `agent-events.ts` | None |
| PostVerify | `module-7` | `post-verification.service.ts` | WakeupService |
| Reasoning | `module-8` | 프롬프트 수정 + API endpoint | None |

### 11.2 Session Guide

| Session | Modules | 예상 시간 |
|---------|---------|-----------|
| **S1** | module-0 (Schema) | 15분 |
| **S2** | module-1 + module-2 (ActionCap + DryRunGate) | 1시간 |
| **S3** | module-3 + module-7 (Snapshot + PostVerify) | 1시간 |
| **S4** | module-4 (Pipeline 오케스트레이터) | 30분 |
| **S5** | module-5 + module-6 (Integration + Seed) | 1시간 |
| **S6** | module-8 (Reasoning 프롬프트) | 30분 |

```
S1 (schema) → S2 (cap+gate) ──┐
                               ├→ S4 (pipeline) → S5 (integration)
S1 (schema) → S3 (snap+verify)┘                  → S6 (reasoning)
```
