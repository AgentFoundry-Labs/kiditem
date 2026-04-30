# Agent OS Directory Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the remaining Agent OS compatibility and runtime surfaces toward the approved `automation/` owner structure while keeping business domains, public routes, and survival-core behavior stable.

**Architecture:** `automation/` becomes the single physical owner for Agent OS runtime code. `rules/` remains the business policy domain and accesses Agent OS through an explicit automation port. `advertising/` owns ad-strategy business surfaces even when the route remains `/api/ad-agent/*`.

**Tech Stack:** NestJS 11, Prisma 7, npm workspaces, Vitest, AppModule module wiring, reconstruction scanners (`check:idor`, `check:tenant-scope`).

---

## Baseline

- Baseline branch: `origin/main`
- Baseline commit at plan creation: `836feac68a45f54428bc937a4ff575dae88ad30f`
- Existing local-only files in the main worktree are unrelated and must not be touched:
  - `kiditem_list (1) 2.xlsx`
  - `wing-inventory-matched 2.xlsx`

## Scope Rules

- One PR per task group below.
- Preserve all public routes.
- Do not move workflow runner/executors unless the task explicitly says so.
- Do not move marketplace catalog behavior unless the task explicitly says so.
- Do not add dependencies.
- Do not add empty target folders.
- Keep compatibility re-export files small and marked as migration shims.
- After each PR, remove merged worktrees and branches.

## Target File Ownership

### Automation-Owned Runtime

- Create as needed: `apps/server/src/automation/application/port/in/agent-runner.port.ts`
- Create as needed: `apps/server/src/automation/adapter/out/agent-runtime/agent-runner.adapter.ts`
- Move eventually: `apps/server/src/agent-registry/events/agent-events.ts` -> `apps/server/src/automation/adapter/out/agent-runtime/agent-events.ts`
- Move eventually: `apps/server/src/agent-registry/agent-registry.controller.ts` -> `apps/server/src/automation/adapter/in/http/agent-registry.controller.ts`
- Move eventually: `apps/server/src/agent-registry/trace/agent-trace.controller.ts` -> `apps/server/src/automation/adapter/in/http/agent-trace.controller.ts`
- Move eventually: `apps/server/src/agent-registry/agent-registry.service.ts` -> `apps/server/src/automation/application/service/agent/agent-registry.service.ts`
- Moved (AO-3B): `apps/server/src/agent-registry/domains/manager/*` -> `apps/server/src/automation/adapter/in/http/manager.controller.ts` + `apps/server/src/automation/application/service/agent/manager.service.ts` + `apps/server/src/automation/adapter/in/http/dto/manager/*` + `apps/server/src/automation/application/service/__tests__/manager.service.spec.ts`

### Rules-Owned Business Policy

- Keep: `apps/server/src/rules/controllers/rules.controller.ts`
- Keep: `apps/server/src/rules/services/rules.service.ts`
- Add no Agent OS runtime implementation under `rules/`.
- Replace direct `AgentRegistryService` injection with the automation Agent Runner port.

### Advertising-Owned Ad Agent Route

- Moved (AO-3C): `apps/server/src/agent-registry/domains/ad-strategy/ad-strategy.controller.ts` -> `apps/server/src/advertising/adapter/in/http/ad-strategy-agent.controller.ts`
- Moved (AO-3C): `apps/server/src/agent-registry/domains/ad-strategy/ad-strategy.service.ts` -> `apps/server/src/advertising/application/service/ad-strategy-agent.service.ts`
- Moved (AO-3C): `apps/server/src/agent-registry/domains/ad-strategy/dto/*` -> `apps/server/src/advertising/adapter/in/http/dto/ad-strategy-agent/*`
- Route preserved: `/api/ad-agent/*`
- `AdStrategyAgentService` coexists with the unchanged `apps/server/src/advertising/application/service/ad-strategy.service.ts` (the original endpoint orchestration service kept its class name).

## Task 1: AO-3A Agent Runner Port + Rules Decoupling

**Status:** Landed. `AGENT_RUNNER_PORT` is exported from `AutomationModule` and `RulesService` injects the port instead of `AgentRegistryService`.

**Files:**
- Create: `apps/server/src/automation/application/port/in/agent-runner.port.ts`
- Create: `apps/server/src/automation/adapter/out/agent-runtime/agent-runner.adapter.ts`
- Modify: `apps/server/src/automation/automation.module.ts`
- Modify: `apps/server/AGENTS.md`
- Modify: `apps/server/src/rules/CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-04-29-backend-architecture-contract.md`
- Modify: `docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md`
- Modify: `apps/server/src/rules/services/rules.service.ts`
- Modify: `apps/server/src/rules/__tests__/rules.service.spec.ts`
- Modify: `apps/server/src/rules/__tests__/rules-flow.spec.ts`

- [ ] **Step 1: Read scoped instructions**

Run:

```bash
sed -n '1,220p' AGENTS.md
sed -n '1,220p' apps/server/AGENTS.md
sed -n '1,220p' apps/server/src/rules/CLAUDE.md
sed -n '1,220p' apps/server/src/automation/adapter/out/agent-runtime/CLAUDE.md
```

Expected: instructions confirm `automation/` is Agent OS owner, `rules/` owns rule evaluation, and direct runtime access should go through ports.

- [ ] **Step 2: Add the automation Agent Runner port**

Create `apps/server/src/automation/application/port/in/agent-runner.port.ts`:

```ts
export const AGENT_RUNNER_PORT = Symbol('AGENT_RUNNER_PORT');

export interface AgentRunnerInput {
  companyId?: string;
  dryRun?: boolean;
  extra?: Record<string, unknown>;
  workflowRunId?: string;
  workflowNodeId?: string;
  sourceDataId?: string;
}

export interface AgentRunnerResult {
  ok: boolean;
  taskId?: string;
  agentType?: string;
}

export interface AgentRunnerPort {
  runByType(type: string, input?: AgentRunnerInput): Promise<AgentRunnerResult>;
}
```

- [ ] **Step 3: Add the Agent Registry-backed adapter**

Create `apps/server/src/automation/adapter/out/agent-runtime/agent-runner.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AgentRegistryService } from '../../../../agent-registry/agent-registry.service';
import type {
  AgentRunnerInput,
  AgentRunnerPort,
  AgentRunnerResult,
} from '../../../application/port/in/agent-runner.port';

@Injectable()
export class AgentRuntimeRunnerAdapter implements AgentRunnerPort {
  constructor(private readonly agentRegistry: AgentRegistryService) {}

  runByType(type: string, input?: AgentRunnerInput): Promise<AgentRunnerResult> {
    return this.agentRegistry.runByType(type, input);
  }
}
```

- [ ] **Step 4: Bind and export the port from AutomationModule**

Modify `apps/server/src/automation/automation.module.ts` imports:

```ts
import { AGENT_RUNNER_PORT } from './application/port/in/agent-runner.port';
import { AgentRuntimeRunnerAdapter } from './adapter/out/agent-runtime/agent-runner.adapter';
```

Add to `providers`:

```ts
{
  provide: AGENT_RUNNER_PORT,
  useClass: AgentRuntimeRunnerAdapter,
},
```

Add to `exports`:

```ts
AGENT_RUNNER_PORT,
```

- [ ] **Step 5: Replace direct RulesService AgentRegistryService usage**

Modify `apps/server/src/rules/services/rules.service.ts`:

```ts
import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../automation/application/port/in/agent-runner.port';
```

Remove:

```ts
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
```

Change constructor:

```ts
constructor(
  private readonly prisma: PrismaService,
  @Inject(AGENT_RUNNER_PORT)
  private readonly agentRunner: AgentRunnerPort,
  private readonly eventEmitter: EventEmitter2,
) {}
```

Change `evaluateAll`:

```ts
async evaluateAll(companyId: string): Promise<EvaluationResult> {
  const result = await this.agentRunner.runByType('rules_evaluation', {
    companyId,
    extra: { company_id: companyId },
  });

  this.logger.log(`Rules evaluation spawned: ${result.taskId}`);
  return { taskId: result.taskId, status: 'running' };
}
```

Change `suggestThresholds`:

```ts
async suggestThresholds(companyId: string): Promise<{ taskId: string | undefined; status: string }> {
  const result = await this.agentRunner.runByType('rules_suggest', {
    companyId,
    extra: { company_id: companyId },
  });

  return { taskId: result.taskId, status: 'running' };
}
```

- [ ] **Step 6: Update rules tests**

In `apps/server/src/rules/__tests__/rules.service.spec.ts` and `apps/server/src/rules/__tests__/rules-flow.spec.ts`, replace registry fakes that expect `findByType` + `run` with an `agentRunner` fake that exposes `runByType`.

Expected assertions:

```ts
expect(agentRunner.runByType).toHaveBeenCalledWith('rules_evaluation', {
  companyId: COMPANY_ID,
  extra: { company_id: COMPANY_ID },
});
```

and:

```ts
expect(agentRunner.runByType).toHaveBeenCalledWith('rules_suggest', {
  companyId: COMPANY_ID,
  extra: { company_id: COMPANY_ID },
});
```

- [ ] **Step 7: Verify AO-3A**

Run:

```bash
git diff --check
npm run check:idor
npm run check:tenant-scope
npm exec --workspace=apps/server -- vitest run src/rules src/automation/adapter/out/agent-runtime
npm run build --workspace=apps/server
```

Expected:

- `git diff --check` exits 0.
- `check:idor` exits 0.
- `check:tenant-scope` has no new findings.
- Vitest passes for rules and the new adapter surface.
- Server build exits 0.

- [ ] **Step 8: Commit and open PR**

Commit message:

```text
Decouple rules evaluation from Agent Registry runtime

Rules is a business policy domain, but it only needs to request
Agent OS work. The new automation Agent Runner port keeps the
runtime dependency behind the automation boundary and removes
direct AgentRegistryService usage from RulesService.

Constraint: Preserve /api/rules/* behavior and agent task creation semantics
Rejected: Fold rules into automation | rules owns business policy definitions
Confidence: high
Scope-risk: narrow
Directive: Rules must not inject AgentRegistryService directly
Tested: git diff --check; npm run check:idor; npm run check:tenant-scope; npm exec --workspace=apps/server -- vitest run src/rules src/automation/adapter/out/agent-runtime; npm run build --workspace=apps/server
Not-tested: Manual API smoke test
```

Open GitHub PR against `main`.

## Task 2: AO-3B Move Manager Agent Surface into Automation

**Status:** Landed. Manager controller, service, DTOs, and the manager.service spec all live under `apps/server/src/automation/`. `/api/manager/*` route shape preserved and the implementation reaches Agent OS through `AGENT_RUNNER_PORT`. The follow-up `Reconcile manager move with ad-agent ownership merge` commit reconciled this with the AO-3C ad-agent merge.

**Files:**
- Move: `apps/server/src/agent-registry/domains/manager/manager.controller.ts` -> `apps/server/src/automation/adapter/in/http/manager.controller.ts`
- Move: `apps/server/src/agent-registry/domains/manager/manager.service.ts` -> `apps/server/src/automation/application/service/agent/manager.service.ts`
- Move: `apps/server/src/agent-registry/domains/manager/dto/*` -> `apps/server/src/automation/adapter/in/http/dto/manager/*`
- Move: `apps/server/src/agent-registry/domains/manager/__tests__/manager.service.spec.ts` -> `apps/server/src/automation/application/service/__tests__/manager.service.spec.ts`
- Modify: `apps/server/src/agent-registry/agent-registry.module.ts`
- Modify: `apps/server/src/automation/automation.module.ts`

- [ ] **Step 1: Start from updated main after AO-3A merge**

Run:

```bash
git checkout main
git pull --ff-only
git checkout -b refactor/agent-os-manager-automation
```

Expected: new branch starts from main that includes AO-3A.

- [ ] **Step 2: Move manager controller, service, DTOs, and test**

Use `git mv` for the files listed above. Do not move `ad-strategy` in this PR.

- [ ] **Step 3: Update imports**

In `manager.controller.ts`, use:

```ts
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';
import { ManagerService } from '../../application/service/agent/manager.service';
import {
  ListConversationsQueryDto,
  ManagerAskBodyDto,
} from './dto/manager';
```

In `manager.service.ts`, replace `AgentRegistryService` with the AO-3A `AgentRunnerPort`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../../port/in/agent-runner.port';
import { AGENT_EVENTS, type AgentResultReadyEvent } from '../../../adapter/out/agent-runtime/agent-events';
```

Constructor:

```ts
constructor(
  private readonly prisma: PrismaService,
  @Inject(AGENT_RUNNER_PORT)
  private readonly agentRunner: AgentRunnerPort,
) {}
```

Calls:

```ts
const result = await this.agentRunner.runByType('manager', {
  companyId: input.companyId,
  dryRun: false,
  extra,
});
```

and:

```ts
await this.agentRunner.runByType(agentType, { companyId: event.companyId });
```

- [ ] **Step 4: Move Agent events or add compatibility import deliberately**

Preferred in this PR: move `apps/server/src/agent-registry/events/agent-events.ts` to `apps/server/src/automation/adapter/out/agent-runtime/agent-events.ts` and leave this compatibility file at the old path:

```ts
export * from '../../automation/adapter/out/agent-runtime/agent-events';
```

Update imports that are already touched by this PR to the new automation path. Do not repo-wide rewrite untouched domains in this PR.

- [ ] **Step 5: Update module registration**

Remove `ManagerController` and `ManagerService` from `apps/server/src/agent-registry/agent-registry.module.ts`.

Add `ManagerController` and `ManagerService` to `apps/server/src/automation/automation.module.ts`.

- [ ] **Step 6: Verify route preservation**

Run:

```bash
npm run dev:server
```

Expected route mapping includes:

```text
Mapped {/api/manager/ask, POST}
Mapped {/api/manager/conversations, GET}
```

Stop the dev server and confirm port 4000 is free:

```bash
lsof -ti :4000
```

Expected: no output.

- [ ] **Step 7: Verify AO-3B**

Run:

```bash
git diff --check
npm exec --workspace=apps/server -- vitest run src/automation src/agent-registry
npm run build --workspace=apps/server
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit and open PR**

Commit message:

```text
Place manager agent surface under Automation owner

The manager route dispatches Agent OS work and records manager
agent conversations, so its implementation belongs with the
automation runtime while the public /api/manager routes stay stable.

Constraint: Preserve /api/manager/* route contract
Rejected: Keep manager under agent-registry/domains | leaves a business-looking folder under runtime compatibility
Confidence: high
Scope-risk: moderate
Directive: New Agent OS operator surfaces belong under automation, not agent-registry/domains
Tested: git diff --check; npm exec --workspace=apps/server -- vitest run src/automation src/agent-registry; npm run build --workspace=apps/server; npm run dev:server route mapping
Not-tested: Manual browser workflow
```

Open GitHub PR against `main`.

## Task 3: AO-3C Move Ad Agent Surface into Advertising

**Status:** Landed. Ad-strategy controller, service, DTOs, and the ad-strategy-agent spec live under `apps/server/src/advertising/`. `/api/ad-agent/*` route shape preserved, `AdStrategyAgentService` reaches Agent OS through `AGENT_RUNNER_PORT`, and the follow-up `Enforce tenant scope on ad-agent task status` commit hardened the ad-agent task status path.

**Files:**
- Move: `apps/server/src/agent-registry/domains/ad-strategy/ad-strategy.controller.ts` -> `apps/server/src/advertising/adapter/in/http/ad-strategy-agent.controller.ts`
- Move: `apps/server/src/agent-registry/domains/ad-strategy/ad-strategy.service.ts` -> `apps/server/src/advertising/application/service/ad-strategy-agent.service.ts`
- Move: `apps/server/src/agent-registry/domains/ad-strategy/dto/*` -> `apps/server/src/advertising/adapter/in/http/dto/ad-strategy-agent/*`
- Move: `apps/server/src/agent-registry/domains/ad-strategy/__tests__/ad-strategy.service.spec.ts` -> `apps/server/src/advertising/application/service/__tests__/ad-strategy-agent.spec.ts`
- Modify: `apps/server/src/agent-registry/agent-registry.module.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`

- [ ] **Step 1: Start from updated main after AO-3B merge**

Run:

```bash
git checkout main
git pull --ff-only
git checkout -b refactor/ad-agent-advertising-owner
```

Expected: new branch starts from main that includes AO-3B.

- [ ] **Step 2: Move and rename the ad-agent service**

Use `git mv` for controller, DTOs, and tests. Rename service class to avoid collision with the existing endpoint orchestration service:

```ts
export class AdStrategyAgentService {
```

Keep the existing `apps/server/src/advertising/application/service/ad-strategy.service.ts` class name unchanged.

- [ ] **Step 3: Update controller imports and injection**

In `ad-strategy-agent.controller.ts`, preserve:

```ts
@Controller('ad-agent')
```

Inject:

```ts
constructor(private readonly adStrategyAgentService: AdStrategyAgentService) {}
```

Use DTO import:

```ts
import { ListAdRunsQueryDto, RunAdStrategyBodyDto } from './dto/ad-strategy-agent';
```

- [ ] **Step 4: Use the automation Agent Runner port**

In `ad-strategy-agent.service.ts`, inject `AgentRunnerPort` instead of `AgentRegistryService`:

```ts
constructor(
  private readonly prisma: PrismaService,
  @Inject(AGENT_RUNNER_PORT)
  private readonly agentRunner: AgentRunnerPort,
) {}
```

Run:

```ts
return this.agentRunner.runByType('ad_strategy', {
  companyId: input.companyId,
  dryRun: input.dryRun,
});
```

- [ ] **Step 5: Update module wiring**

Remove `AdStrategyController` and legacy `AdStrategyService` imports from `apps/server/src/agent-registry/agent-registry.module.ts`.

Add `AdStrategyAgentController` and `AdStrategyAgentService` to `apps/server/src/advertising/advertising.module.ts`.

If `AdStrategyAgentService` injects `AGENT_RUNNER_PORT`, import `AutomationModule` in `AdvertisingModule`.

- [ ] **Step 6: Verify route preservation**

Run:

```bash
npm run dev:server
```

Expected route mapping includes:

```text
Mapped {/api/ad-agent/run, POST}
Mapped {/api/ad-agent/status/:taskId, GET}
Mapped {/api/ad-agent/latest, GET}
Mapped {/api/ad-agent/runs, GET}
```

Stop the dev server and confirm port 4000 is free:

```bash
lsof -ti :4000
```

Expected: no output.

- [ ] **Step 7: Verify AO-3C**

Run:

```bash
git diff --check
npm exec --workspace=apps/server -- vitest run src/advertising src/agent-registry src/automation
npm run build --workspace=apps/server
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit and open PR**

Commit message:

```text
Move ad-agent route implementation to Advertising

The /api/ad-agent surface records advertising strategy runs and
activity events, so the implementation belongs to the advertising
owner domain while Agent OS execution is reached through the
automation runner port.

Constraint: Preserve /api/ad-agent/* routes
Rejected: Keep ad strategy under agent-registry/domains | hides advertising behavior under runtime compatibility
Confidence: high
Scope-risk: moderate
Directive: Advertising-owned agent entrypoints live under advertising and call Agent OS through ports
Tested: git diff --check; npm exec --workspace=apps/server -- vitest run src/advertising src/agent-registry src/automation; npm run build --workspace=apps/server; npm run dev:server route mapping
Not-tested: Manual ad-agent execution
```

Open GitHub PR against `main`.

## Task 4: AO-3D Move Agent Registry HTTP Compatibility into Automation

**Files:**
- Move: `apps/server/src/agent-registry/agent-registry.controller.ts` -> `apps/server/src/automation/adapter/in/http/agent-registry.controller.ts`
- Move: `apps/server/src/agent-registry/dto/*` -> `apps/server/src/automation/adapter/in/http/dto/agent-registry/*`
- Move: `apps/server/src/agent-registry/trace/agent-trace.controller.ts` -> `apps/server/src/automation/adapter/in/http/agent-trace.controller.ts`
- Move: `apps/server/src/agent-registry/trace/dto/*` -> `apps/server/src/automation/adapter/in/http/dto/agent-trace/*`
- Move: `apps/server/src/agent-registry/agent-registry.service.ts` -> `apps/server/src/automation/application/service/agent/agent-registry.service.ts`
- Replace old service file with a compatibility re-export.
- Modify: `apps/server/src/agent-registry/agent-registry.module.ts`
- Modify: `apps/server/src/automation/automation.module.ts`

- [ ] **Step 1: Start from updated main after AO-3C merge**

Run:

```bash
git checkout main
git pull --ff-only
git checkout -b refactor/agent-registry-http-automation
```

Expected: new branch starts from main that includes AO-3C.

- [ ] **Step 2: Move service and leave compatibility re-export**

Move the service:

```bash
git mv apps/server/src/agent-registry/agent-registry.service.ts apps/server/src/automation/application/service/agent/agent-registry.service.ts
```

Create old-path shim:

```ts
export {
  AgentRegistryService,
  type AgentRunInput,
} from '../automation/application/service/agent/agent-registry.service';
```

Update imports inside the moved service to use its new relative location:

```ts
import { HeartbeatService } from './heartbeat.service';
import { AgentCostAnalyticsService } from './agent-cost-analytics.service';
import { AgentCrudService } from './agent-crud.service';
import { AgentLifecycleService } from './agent-lifecycle.service';
import { AgentRunService } from './agent-run.service';
import type {
  AgentDefinitionUpdateData,
  AgentRunInput,
} from './agent-registry.types';
```

- [ ] **Step 3: Move controller and DTOs**

Use `git mv` for the controller and DTOs. Preserve:

```ts
@Controller('agent-registry')
```

Controller imports should point to:

```ts
import { AgentRegistryService } from '../../application/service/agent/agent-registry.service';
import {
  CreateAgentDto,
  DelegateAgentDto,
  ListAgentsQueryDto,
  PauseAgentDto,
  RunAgentDto,
  RunByTypeDto,
  RunHistoryQueryDto,
  UpdateAgentDto,
  UpdateTrustLevelDto,
} from './dto/agent-registry';
```

- [ ] **Step 4: Move trace controller and DTOs**

Use `git mv` for trace controller and trace DTOs. Preserve the existing route path exactly.

If `AgentTraceService` remains in the old folder for this PR, keep the controller import pointing to the old service path. This PR moves the HTTP compatibility surface first; trace service internals can move later.

- [ ] **Step 5: Update module registration**

Keep `AgentRegistryModule` as the module compatibility host in this PR unless moving controllers to `AutomationModule` is DI-clean after tests.

Allowed intermediate state:

- `AgentRegistryModule` imports controllers from `automation/adapter/in/http`.
- `AgentRegistryModule` provides `AgentRegistryService` imported from `automation/application/service/agent/agent-registry.service`.
- `automation/` physically owns the files.
- Public routes remain registered once.

- [ ] **Step 6: Verify no old implementation remains**

Run:

```bash
find apps/server/src/agent-registry -maxdepth 2 -type f | sort
rg "class AgentRegistryController|class AgentRegistryService|class AgentTraceController" apps/server/src/agent-registry
```

Expected:

- Old `agent-registry/agent-registry.service.ts` contains only a re-export.
- `AgentRegistryController`, `AgentRegistryService`, and `AgentTraceController` class implementations are under `automation/`.

- [ ] **Step 7: Verify AO-3D**

Run:

```bash
git diff --check
npm exec --workspace=apps/server -- vitest run src/agent-registry src/automation
npm run build --workspace=apps/server
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit and open PR**

Commit message:

```text
Move Agent Registry HTTP compatibility under Automation

Agent Registry remains a public API route and injection token, but
the implementation files now live under the automation owner tree.
The old service path is retained as a migration shim for existing
callers while later PRs replace direct imports with ports.

Constraint: Preserve /api/agent-registry/* and trace routes
Rejected: Delete AgentRegistryModule immediately | module wiring still hosts compatibility registration
Confidence: medium
Scope-risk: moderate
Directive: Do not add new implementation under apps/server/src/agent-registry
Tested: git diff --check; npm exec --workspace=apps/server -- vitest run src/agent-registry src/automation; npm run build --workspace=apps/server
Not-tested: Manual API smoke test
```

Open GitHub PR against `main`.

## Task 5: AO-3E Runtime Internals Inventory and Final Shim Plan

**Files:**
- Modify: `docs/superpowers/plans/2026-04-30-agent-os-directory-structure.md`
- Optionally modify: `apps/server/src/automation/automation.module.ts`
- Optionally modify: `apps/server/src/agent-registry/agent-registry.module.ts`

- [ ] **Step 1: Re-audit remaining `agent-registry/` files**

Run:

```bash
find apps/server/src/agent-registry -maxdepth 4 -type f | sort
rg "from ['\\\"].*agent-registry|agent-registry/" apps/server/src -g '*.ts'
```

Expected: remaining files fall into one of these buckets:

- compatibility shim
- safety/permission/runtime internals
- trace service internals
- test files for compatibility

- [ ] **Step 2: Record the final move map**

Append an "AO-3E Remaining Runtime Internals" section to this plan with exact current files and target folders. Use these target lanes:

```text
agent-registry/heartbeat/* -> automation/application/service/agent/
agent-registry/wakeup/* -> automation/application/service/agent/
agent-registry/lifecycle/* -> automation/application/service/agent/lifecycle/
agent-registry/business-safety/* -> automation/domain/policy/business-safety/
agent-registry/safety/* -> automation/domain/policy/safety/
agent-registry/permissions/* -> automation/domain/policy/permissions/
agent-registry/delegation/* -> automation/application/service/agent/delegation/
agent-registry/context-manager/* -> automation/application/service/agent/context-manager/
agent-registry/skills/* -> automation/adapter/out/agent-runtime/skills/
agent-registry/schemas/* -> automation/domain/policy/agent-output/
agent-registry/trace/agent-trace.service.ts -> automation/application/service/agent/trace.service.ts
agent-registry/events/agent-sse.service.ts -> automation/adapter/out/agent-runtime/agent-sse.service.ts
```

- [ ] **Step 3: Decide whether to execute the final move now**

Proceed only if the previous PRs have made `agent-registry/` small enough that moving remaining internals is mechanical and testable. Otherwise, keep AO-3E documentation-only and split another implementation plan.

- [ ] **Step 4: Verify documentation-only AO-3E**

Run:

```bash
git diff --check
```

Expected: exits 0.

- [ ] **Step 5: Commit and open PR**

Commit message for documentation-only AO-3E:

```text
Record final Agent Registry shim retirement map

The remaining Agent Registry files are classified into runtime
internals, trace compatibility, and temporary shims so the next
implementation PR can delete the top-level folder without guessing.

Constraint: No production code changes in this PR
Rejected: Bulk move remaining internals without re-audit | previous PRs may change import shape
Confidence: high
Scope-risk: narrow
Directive: Do not add new implementation under apps/server/src/agent-registry
Tested: git diff --check
Not-tested: Runtime behavior unchanged by documentation-only PR
```

Open GitHub PR against `main`.

## Full Verification Gate After Task 4 or Task 5

Run on current `main` after each merged PR:

```bash
git pull --ff-only
git diff --check HEAD
npm run check:idor
npm run check:tenant-scope
npm exec --workspace=apps/server -- vitest run src/automation src/agent-registry src/rules src/advertising src/ai src/sourcing
npm run build --workspace=apps/server
```

Expected:

- All commands exit 0, except documented existing scanner baseline findings if present.
- Public route mappings remain stable for Agent OS routes.
- No new direct `AgentRegistryService` imports are added outside compatibility files.

## Self-Review

- Spec coverage: The plan implements the approved topology by keeping `rules/` as business policy, moving manager to `automation/`, moving ad-agent to `advertising/`, and moving agent-registry compatibility toward `automation/`.
- Placeholder scan: No task uses TBD, TODO, "implement later", or unspecified tests.
- Type consistency: `AgentRunnerPort`, `AGENT_RUNNER_PORT`, and `AgentRunnerInput` names are consistent across tasks.
- Scope check: The work is split into narrow PRs and does not bulk-fold the Agent OS runtime.
