# Product-Embedded Hermes Runtime Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hermes를 KidItem 제품 서버 안에서 실행하는 Operator·Leaf subprocess runtime과 전용 harness를 제거하고, Hermes는 Mac mini에서 Slack·Linear·GitHub를 통해 개발팀을 조율하는 외부 도구로만 사용한다.

**Architecture:** KidItem Agent OS는 제품 경계 안에서 결정론적 기본 runtime과 선택적 `openai_responses` Operator runtime을 유지한다. Agent OS task graph, approvals, artifacts, domain capability와 provider-neutral MCP 계약은 그대로 남는다. 외부 Hermes 개발팀은 KidItem 서버에 embed되지 않으며 저장소·PR·Linear·Slack을 협업 표면으로 사용한다.

**Tech Stack:** NestJS 11, TypeScript, Vitest, Agent OS runtime registry, Model Context Protocol, npm workspaces

## Global Constraints

- 이 계획은 Graphify 제거와 독립된 `chore/remove-product-hermes-runtime` 브랜치 및 PR로 실행한다. 기준 브랜치와 PR 대상은 `develop`이다.
- 모든 셸 명령은 저장소 규칙에 따라 `rtk`로 시작한다.
- Mac mini의 Hermes 설치, Hermes agent persona, Slack/Linear 연결, 대화 archive는 외부 개발 운영 경계이며 삭제하거나 이 저장소에 재구현하지 않는다.
- KidItem 최종 사용자용 Agent OS, task graph, approval, artifact, deterministic handler, generic MCP server/tool registry는 유지한다.
- `OpenAiResponsesOperatorRuntimeAdapter`, `run-openai-operator.ts`, root `agent-os:operator:openai` script는 유지한다. 이들은 남는 제품 runtime의 명시적 검증 진입점이다.
- `agent-os:mcp:kiditem` script와 `kiditem-agent-os-mcp-server.ts`는 provider-neutral API이므로 유지한다.
- 로컬 `.agents/`, `.claude/`, `.gstack/`, `.superpowers/`는 건드리지 않는다.
- silent model fallback을 새로 만들지 않는다. `openai_responses` 선택 시 명시적 model/key 계약을 유지한다.
- 스키마와 데이터는 바꾸지 않는다. `VERSION` 증가, `db:push`, backfill, data migration은 필요 없다.
- 삭제 전에 `hermes`와 `hermes_tool_loop`이 더 이상 선택 가능한 runtime이 아니라는 회귀 테스트를 먼저 red로 만든다.

---

## 경계 결정

현재 KidItem 서버는 Hermes CLI subprocess, task-session별 `HERMES_HOME`, Operator JSON/runtime, MCP tool-loop, Leaf runtime, live E2E CLI와 전용 환경 변수를 직접 소유한다. 이 구조는 개발팀을 조율하려는 외부 Hermes와 최종 사용자 Agent OS runtime을 결합한다.

목표 경계는 다음과 같다.

```text
Mac mini Hermes development team
  -> Slack discussion / searchable archive
  -> Linear issue state
  -> Git + GitHub branch, commit, PR, review
  -> KidItem repository

KidItem product server
  -> deterministic Agent OS Operator (default)
  -> OpenAI Responses Operator (explicit opt-in)
  -> deterministic Leaf/domain handlers
  -> provider-neutral Agent OS MCP tools
  -> task graph, approvals, artifacts, audit, side-effect gates
```

외부 Hermes가 개발 작업 중 저장소를 읽거나 CLI를 호출하는 것은 허용되지만, Nest process가 Hermes binary/profile/auth를 관리하거나 Hermes를 제품 요청 처리 provider로 선택하지 않는다.

## 유지 대상

- `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`의 deterministic 기본 경로
- `apps/server/src/agent-os/adapter/out/runtime/openai-responses-operator-runtime.adapter.ts`
- `apps/server/src/agent-os/adapter/in/cli/run-openai-operator.ts`
- `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts`
- `apps/server/src/agent-os/application/service/agent-os-mcp-tool-executor.service.ts`
- `apps/server/src/agent-os/application/service/kiditem-mcp-tool-registry.service.ts`
- `apps/server/src/sourcing/adapter/out/runtime/sourcing-runtime.handler.ts`의 deterministic sourcing/listing registration
- Agent OS repository, run events, approvals, artifacts, runtime registry와 도메인 capability

## 삭제 대상

- Hermes Operator CLI와 live tool-loop E2E CLI
- Hermes Operator/Leaf runtime, subprocess adapter, profile service, finalization helper와 전용 tests
- Nest module의 Hermes providers
- `AGENT_OS_HERMES_*` 환경 변수와 Hermes runtime 선택값
- Hermes 전용 npm scripts, runbook, living design spec
- generic MCP 설명과 실행 canvas에 남은 provider-specific 문구

## Task 1: Hermes Operator runtime 선택과 CLI 제거

**Files:**
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`
- Modify: `apps/server/package.json`
- Modify: `package.json`
- Delete: `apps/server/src/agent-os/adapter/in/cli/run-hermes-operator.ts`
- Delete: `apps/server/src/agent-os/adapter/in/cli/__tests__/run-hermes-operator.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/in/cli/run-hermes-tool-loop-e2e.ts`
- Delete: `apps/server/src/agent-os/adapter/in/cli/__tests__/run-hermes-tool-loop-e2e.spec.ts`

- [ ] **Step 1: 폐기 runtime 값이 unsupported가 되는 실패 테스트 작성**

`operator-runtime.handler.spec.ts`의 현재 generic unsupported test 앞에 다음 테스트를 추가한다. 이 단계에서는 기존 Hermes success tests와 fixture를 아직 삭제하지 않는다.

```typescript
it.each(['hermes', 'hermes_tool_loop'])(
  'rejects retired Operator runtime %s before building provider context',
  async (runtime) => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = runtime;
    const { handler, contextBuilder, parser, executor, delegation } =
      makeHandler();

    await expect(handler.execute(runtimeContext())).rejects.toMatchObject({
      name: 'AgentOsRuntimeError',
      code: 'operator_runtime_unsupported',
      message:
        `Unsupported Agent OS Operator runtime: ${runtime}. ` +
        'Use openai_responses or omit AGENT_OS_OPERATOR_RUNTIME for the deterministic path.',
    });

    expect(delegation.delegate).not.toHaveBeenCalled();
    expect(contextBuilder.build).not.toHaveBeenCalled();
    expect(parser.parse).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  },
);
```

- [ ] **Step 2: 현재 runtime 분기 때문에 실패 확인**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`

Expected: FAIL. `hermes`는 adapter를 실행하고 `hermes_tool_loop`은 finalization 경로로 들어가므로 새 unsupported 계약과 일치하지 않는다.

- [ ] **Step 3: Operator handler를 deterministic/OpenAI 두 경로로 축소**

`operator-runtime.handler.ts`에서 다음을 삭제한다.

- `HermesOperatorRuntimeAdapter` import와 constructor dependency
- `hermes-task-finalization` imports
- `hermesLeafAgentTypesConfigured`
- `renderHermesToolLoopPrompt`
- `contextForHermesToolLoop`
- Hermes tool-loop에서만 쓰이는 `isRecord`
- `executeHermes`
- `executeHermesToolLoop`
- Hermes Leaf env가 설정됐을 때 `operator_runtime_required`를 던지는 guard

runtime 선택부는 다음으로 고정한다.

```typescript
const runtime = selectedOperatorRuntime();
if (runtime === 'openai_responses') {
  return this.executeOpenAiResponses(context);
}
if (runtime) {
  throw new AgentOsRuntimeError(
    'operator_runtime_unsupported',
    `Unsupported Agent OS Operator runtime: ${runtime}. ` +
      'Use openai_responses or omit AGENT_OS_OPERATOR_RUNTIME for the deterministic path.',
  );
}
```

constructor는 다음 dependency 순서를 갖는다.

```typescript
constructor(
  private readonly registry: AgentRuntimeHandlerRegistry,
  private readonly delegation: AgentTaskDelegationService,
  private readonly contextBuilder: OperatorContextBuilder,
  private readonly decisionParser: OperatorDecisionParser,
  private readonly decisionExecutor: OperatorDecisionExecutor,
  private readonly openAiRuntime: OpenAiResponsesOperatorRuntimeAdapter,
  @Inject(AGENT_OS_REPOSITORY_PORT)
  private readonly repository: AgentOsRepositoryPort,
) {}
```

- [ ] **Step 4: Operator test fixture와 폐기 success tests 정리**

`operator-runtime.handler.spec.ts`에서 다음을 삭제한다.

- `HermesOperatorRuntimeAdapter` type import
- 더 이상 값으로 사용되지 않는 `AgentOsRuntimeError` import
- `hermesRuntime` mock, 반환값, constructor argument
- tool-loop test만 사용하는 `runEvent` helper
- “Hermes Leaf mode requires Operator runtime” test
- Hermes Operator success/failure/decision rejection tests
- Hermes tool-loop finalization/waiting approval/timeout/pagination/missing finalization tests

새 `it.each` regression test, existing generic unsupported test, OpenAI test, deterministic tests는 유지한다. `makeHandler()`는 `openAiRuntime` 다음에 `repository`를 전달한다.

- [ ] **Step 5: Hermes 전용 CLI와 npm script 삭제**

```bash
rtk git rm apps/server/src/agent-os/adapter/in/cli/run-hermes-operator.ts apps/server/src/agent-os/adapter/in/cli/__tests__/run-hermes-operator.spec.ts
rtk git rm apps/server/src/agent-os/adapter/in/cli/run-hermes-tool-loop-e2e.ts apps/server/src/agent-os/adapter/in/cli/__tests__/run-hermes-tool-loop-e2e.spec.ts
```

그 후 다음 script만 삭제한다.

- `apps/server/package.json`: `agent-os:operator:hermes`
- root `package.json`: `agent-os:e2e:hermes-tool-loop`

`agent-os:mcp:kiditem`과 `agent-os:operator:openai`는 유지한다.

- [ ] **Step 6: Operator 경계 검증**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`

Expected: PASS. 두 폐기 값은 exact `operator_runtime_unsupported`로 거부되고 OpenAI와 deterministic tests는 계속 통과한다.

Run: `rtk npm run build --workspace=apps/server`

Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
rtk git add apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts apps/server/package.json package.json
rtk git commit -m "refactor: remove Hermes Operator runtimes"
```

## Task 2: Hermes Leaf runtime과 Nest wiring 제거

**Files:**
- Modify: `apps/server/src/sourcing/adapter/out/runtime/__tests__/sourcing-runtime.handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/out/runtime/sourcing-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts`
- Modify: `apps/server/src/agent-os/agent-os.module.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/hermes-operator-runtime.adapter.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/hermes-runtime-profile.service.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-profile.service.spec.ts`
- Delete: `apps/server/src/agent-os/adapter/out/runtime/hermes-task-finalization.ts`

- [ ] **Step 1: deterministic Leaf handler 소유권을 고정하는 실패 테스트 작성**

`sourcing-runtime.handler.spec.ts`의 “does not register deterministic handlers for Hermes-owned Leaf agents” test를 다음 반대 계약으로 교체한다. retired env 문자열은 재도입 방지용 regression fixture에만 남긴다.

```typescript
it('keeps deterministic handlers registered when retired leaf runtime env is present', () => {
  process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES = 'sourcing,listing';
  const registry = { register: vi.fn() };
  const toolRouter = { invoke: vi.fn() };
  const playwright = { execute: vi.fn() };
  const handler = new SourcingRuntimeHandler(
    registry as never,
    toolRouter as never,
    playwright as never,
  );

  handler.onModuleInit();

  expect(registry.register).toHaveBeenCalledWith('sourcing', handler);
  expect(registry.register).toHaveBeenCalledWith('listing', handler);
});
```

- [ ] **Step 2: 기존 env ownership 분기 때문에 실패 확인**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/sourcing/adapter/out/runtime/__tests__/sourcing-runtime.handler.spec.ts`

Expected: FAIL because the current `hermesLeafOwns` guard suppresses both registrations.

- [ ] **Step 3: sourcing/listing registration을 무조건 deterministic으로 복원**

`sourcing-runtime.handler.ts`에서 `hermesLeafOwns` 함수를 삭제하고 `onModuleInit`을 다음처럼 단순화한다.

```typescript
onModuleInit(): void {
  this.registry.register('sourcing', this);
  this.registry.register('listing', this);
}
```

- [ ] **Step 4: Hermes Leaf·subprocess·profile·finalization 구현 삭제**

```bash
rtk git rm apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
rtk git rm apps/server/src/agent-os/adapter/out/runtime/hermes-operator-runtime.adapter.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts
rtk git rm apps/server/src/agent-os/adapter/out/runtime/hermes-runtime-profile.service.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-profile.service.spec.ts
rtk git rm apps/server/src/agent-os/adapter/out/runtime/hermes-task-finalization.ts
```

- [ ] **Step 5: Nest module과 wiring test를 provider-neutral로 정리**

`agent-os.module.ts`에서 다음 imports와 providers를 삭제한다.

```text
HermesOperatorRuntimeAdapter
HermesLeafRuntimeHandler
HermesRuntimeProfileService
```

`agent-os.module.wiring.spec.ts`에서는 Hermes imports와 `toContain` assertions를 삭제하고 test 이름을 `registers provider-neutral Operator orchestration providers`로 바꾼다. 아래 positive expectations는 반드시 유지한다.

```typescript
expect(providers).toContain(OpenAiResponsesOperatorRuntimeAdapter);
expect(providers).toContain(AgentOsMcpToolExecutor);
expect(providers).toContain(KidItemMcpToolRegistry);
expect(providers).toContain(OperatorRuntimeHandler);
expect(providers).toContain(AgentOsLiveReadinessAdapter);
```

- [ ] **Step 6: Leaf ownership과 module build 검증**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/adapter/out/runtime/__tests__/sourcing-runtime.handler.spec.ts src/agent-os/__tests__/agent-os.module.wiring.spec.ts src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts
```

Expected: PASS.

Run: `rtk npm run build --workspace=apps/server`

Expected: PASS with no missing provider or deleted import.

- [ ] **Step 7: 커밋**

```bash
rtk git add apps/server/src/sourcing/adapter/out/runtime/sourcing-runtime.handler.ts apps/server/src/sourcing/adapter/out/runtime/__tests__/sourcing-runtime.handler.spec.ts apps/server/src/agent-os/agent-os.module.ts apps/server/src/agent-os/__tests__/agent-os.module.wiring.spec.ts
rtk git commit -m "refactor: remove Hermes leaf runtime wiring"
```

## Task 3: 유지하는 MCP 계약을 provider-neutral로 정리

**Files:**
- Modify: `apps/server/src/agent-os/application/service/__tests__/agent-os-mcp-tool-executor.service.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/kiditem-mcp-tool-registry.service.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/agent-os-mcp-tool-executor.service.ts`
- Modify: `apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts`

- [ ] **Step 1: create-task ownership error의 provider-neutral 실패 assertion 추가**

`agent-os-mcp-tool-executor.service.spec.ts`의 “requires Operator-created tasks…” test에서 playbookKey가 빠진 첫 rejection을 다음처럼 강화한다.

```typescript
).rejects.toMatchObject<Partial<AgentOsRuntimeError>>({
  code: 'mcp_create_task_input_invalid',
  message:
    'agent_os_create_task requires playbookKey so the Operator owns the orchestration decision.',
});
```

- [ ] **Step 2: 현재 Hermes-specific error로 실패 확인**

Run: `rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-os-mcp-tool-executor.service.spec.ts`

Expected: FAIL because the current error says Hermes owns the decision.

- [ ] **Step 3: production MCP 문구를 제품 역할 중심으로 변경**

`agent-os-mcp-tool-executor.service.ts`의 error를 다음 exact message로 바꾼다.

```text
agent_os_create_task requires playbookKey so the Operator owns the orchestration decision.
```

`kiditem-agent-os-mcp-server.ts`의 finalize tool description은 다음으로 바꾼다.

```text
Finalize the current task through KidItem Agent OS.
```

- [ ] **Step 4: 유지되는 MCP 테스트 이름에서 provider 결합 제거**

다음 test 이름만 바꾸고 assertions와 tool schema는 유지한다.

- `queues child tasks unless the Operator explicitly asks for inline execution`
- `exposes only curated KidItem domain capabilities to model-provider sessions`
- `registers first-class domain tools with concrete input schemas for agent correction loops`

- [ ] **Step 5: MCP executor·registry·server 좁은 테스트 실행**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/application/service/__tests__/agent-os-mcp-tool-executor.service.spec.ts src/agent-os/application/service/__tests__/kiditem-mcp-tool-registry.service.spec.ts src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts
```

Expected: PASS. `agent-os:mcp:kiditem` 구현과 tool 목록은 삭제되지 않는다.

- [ ] **Step 6: 커밋**

```bash
rtk git add apps/server/src/agent-os/application/service/agent-os-mcp-tool-executor.service.ts apps/server/src/agent-os/application/service/__tests__/agent-os-mcp-tool-executor.service.spec.ts apps/server/src/agent-os/application/service/__tests__/kiditem-mcp-tool-registry.service.spec.ts apps/server/src/agent-os/adapter/in/mcp/kiditem-agent-os-mcp-server.ts apps/server/src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts
rtk git commit -m "refactor: make Agent OS MCP provider neutral"
```

## Task 4: 환경 변수와 durable 문서에서 제품 Hermes 계약 제거

**Files:**
- Modify: `apps/server/.env.example`
- Modify: `deploy/staging/env/api.env.example`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/superpowers/specs/archive/2026-06-04-agent-os-execution-canvas-design.md`
- Delete: `docs/runbooks/agent-os-hermes-runtime.md`
- Delete: `docs/superpowers/specs/2026-05-29-agent-os-operator-backbone-design.md`

- [ ] **Step 1: local/staging env examples를 남는 runtime과 일치시킴**

`apps/server/.env.example`의 Agent OS 주석과 변수 묶음을 다음 exact block으로 바꾼다.

```dotenv
# Leave AGENT_OS_OPERATOR_RUNTIME empty for the deterministic Operator.
# Set it to openai_responses only with an explicit model and API key.
AGENT_RUNTIME_WORKER_ENABLED=0
AGENT_DEFAULT_MODEL=gemini-2.5-flash
AGENT_OS_OPERATOR_RUNTIME=
OPENAI_API_KEY=
AGENT_OS_OPENAI_RESPONSES_MODEL=
AGENT_OS_OPENAI_RESPONSES_TIMEOUT_MS=
AGENT_OS_OPENAI_RESPONSES_BASE_URL=
```

`deploy/staging/env/api.env.example`에는 같은 block을 쓰되 worker를 staging 기존값으로 유지한다.

```dotenv
# Leave AGENT_OS_OPERATOR_RUNTIME empty for the deterministic Operator.
# Set it to openai_responses only with an explicit model and API key.
AGENT_RUNTIME_WORKER_ENABLED=1
AGENT_DEFAULT_MODEL=gemini-2.5-flash
AGENT_OS_OPERATOR_RUNTIME=
OPENAI_API_KEY=
AGENT_OS_OPENAI_RESPONSES_MODEL=
AGENT_OS_OPENAI_RESPONSES_TIMEOUT_MS=
AGENT_OS_OPENAI_RESPONSES_BASE_URL=
```

두 파일에서 모든 `AGENT_OS_HERMES_*` placeholder와 Hermes staging comment를 삭제한다.

- [ ] **Step 2: 환경 변수 reference를 deterministic/OpenAI 계약으로 변경**

`docs/runbooks/environment-variables.md`의 `AGENT_OS_OPERATOR_RUNTIME` row를 다음 의미로 바꾼다.

```text
Set `openai_responses` for the optional hosted Operator runtime. Missing value keeps the deterministic path. Any other value fails closed with `operator_runtime_unsupported`.
```

`AGENT_OS_HERMES_PATH`부터 `AGENT_OS_HERMES_ENABLE_KIDITEM_MCP`까지 9개 row를 삭제한다. `OPENAI_API_KEY`와 세 개 `AGENT_OS_OPENAI_RESPONSES_*` row는 유지한다.

- [ ] **Step 3: 폐기된 living design과 runbook 삭제**

```bash
rtk git rm docs/runbooks/agent-os-hermes-runtime.md
rtk git rm docs/superpowers/specs/2026-05-29-agent-os-operator-backbone-design.md
```

두 문서는 전체 목적이 embedded Hermes runtime이므로 부분 수정하거나 historical fallback으로 남기지 않는다. Git history에서 과거 결정은 계속 확인할 수 있다.

- [ ] **Step 4: execution canvas spec를 provider-neutral로 갱신**

`docs/superpowers/specs/archive/2026-06-04-agent-os-execution-canvas-design.md`에서 세 곳을 다음처럼 바꾼다.

```text
what the Operator and leaf agents actually did while the user continues
to interact through chat.
```

```text
- visual validation of `/agent-os` with a seeded or live Agent OS execution run
```

```text
- Whether model-provider traces should be shown as nested detail rows under tool nodes or kept only in developer/debug views.
```

- [ ] **Step 5: production/runtime 문구 제거와 retained entrypoint 확인**

Run:

```bash
rtk rg -n -S 'Hermes|hermes|AGENT_OS_HERMES|hermes_tool_loop' apps/server/src apps/server/package.json package.json apps/server/.env.example deploy/staging/env/api.env.example docs --glob '!**/__tests__/**' --glob '!docs/superpowers/plans/**'
```

Expected: no output.

Run:

```bash
rtk rg -n 'agent-os:mcp:kiditem|agent-os:operator:openai' apps/server/package.json package.json
```

Expected: both retained entrypoints are present.

- [ ] **Step 6: 커밋**

```bash
rtk git add apps/server/.env.example deploy/staging/env/api.env.example docs
rtk git commit -m "docs: separate external Hermes from KidItem runtime"
```

## Task 5: 전체 서버 검증과 PR 인계

**Files:**
- Verify only; no planned source edits

- [ ] **Step 1: 핵심 회귀 suite 실행**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/__tests__/agent-os.module.wiring.spec.ts src/sourcing/adapter/out/runtime/__tests__/sourcing-runtime.handler.spec.ts src/agent-os/application/service/__tests__/agent-os-mcp-tool-executor.service.spec.ts src/agent-os/application/service/__tests__/kiditem-mcp-tool-registry.service.spec.ts src/agent-os/adapter/in/mcp/__tests__/kiditem-agent-os-mcp-server.spec.ts
```

Expected: PASS. 폐기 runtime rejection, deterministic Leaf registration, OpenAI Operator, generic MCP 계약이 모두 증명된다.

- [ ] **Step 2: backend build와 boot gate 실행**

Run: `rtk npm run build --workspace=apps/server`

Expected: PASS with no deleted import or Nest DI error.

Run: `rtk npm run dev:server`

Expected: Nest가 compile되고 application boot를 성공적으로 기록한다. 성공 로그를 확인한 직후 `Ctrl-C`로 watch process를 종료한다.

- [ ] **Step 3: repository convention과 stale reference 확인**

Run: `rtk npm run check:conventions`

Expected: PASS.

Run: `rtk git diff --check`

Expected: PASS.

Run:

```bash
rtk rg -n -S 'Hermes|hermes|AGENT_OS_HERMES|hermes_tool_loop' apps/server/src apps/server/package.json package.json apps/server/.env.example deploy/staging/env/api.env.example docs --glob '!**/__tests__/**' --glob '!docs/superpowers/plans/**'
```

Expected: no production/config/durable-doc matches. `operator-runtime.handler.spec.ts`와 `sourcing-runtime.handler.spec.ts`의 negative regression fixtures만 test scope에 남는다.

- [ ] **Step 4: 삭제와 유지 경계를 파일 수준으로 확인**

Run:

```bash
rtk git ls-files | rtk rg -n '(^|/)hermes[^/]*|agent-os-hermes-runtime|2026-05-29-agent-os-operator-backbone-design'
```

Expected: no output.

Run: `rtk git log --oneline origin/develop..HEAD`

Expected: 이 계획의 네 개 Hermes 경계 변경 커밋만 보이고 Graphify 또는 unrelated 변경이 없다.

- [ ] **Step 5: PR body guards 실행**

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: PASS.

- [ ] **Step 6: `develop` 대상 PR 생성 및 live body 확인**

`.github/PULL_REQUEST_TEMPLATE.md`를 그대로 사용하고 다음 결정을 명시한다.

```text
Release decision: no VERSION change. No Prisma schema change, db:push, backfill, data migration, or dev-data update is required. Hermes remains an external development-team orchestrator; KidItem retains deterministic Agent OS, optional OpenAI Responses, and provider-neutral MCP contracts.
```

PR을 만든 직후 다음으로 저장된 본문을 확인한다.

Run: `rtk gh pr view --json baseRefName,headRefName,commits,body --jq '{base: .baseRefName, head: .headRefName, commits: (.commits | length), body: .body}'`

Expected: base가 `develop`, head가 `chore/remove-product-hermes-runtime`, commit 수가 예상과 일치하고 template 필수 section과 Release decision이 모두 존재한다.
