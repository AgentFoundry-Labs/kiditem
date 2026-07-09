# Task 2 Report: Resume And Persist Hermes Task Sessions

## Scope

- Added Hermes task-session helpers for reading `metadata.runtimeThreadId`,
  loading resume state through `getTaskSession`, and persisting returned Hermes
  session ids through `updateTaskSessionMetadata`.
- Wired Hermes resume/persist behavior into:
  - `OperatorRuntimeHandler.executeHermes`
  - `OperatorRuntimeHandler.executeHermesToolLoop`
  - `HermesLeafRuntimeHandler.execute`
- Added handler coverage proving existing task-session state is resumed and new
  Hermes session ids are persisted.
- Kept persistence scoped to existing
  `AgentTaskSession.metadata.runtimeThreadId`.
- Did not implement usage/cost propagation and did not touch frontend.

## TDD Record

### RED 1

Command:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts
```

Result:

- Failed as expected because `../hermes-task-session` did not exist.

### GREEN 1

Command:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts
```

Result:

- Passed: `1` file, `3` tests.

### RED 2

Command:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
```

Result:

- Failed before session assertions because the new fixtures from the brief used
  `agent.tool_invocation.completed`, while the current runtime finalization
  reader in this branch only recognizes `agent_os.task_finalized`.

Adjustment:

- Updated only the two new test fixtures to the repo’s existing
  `agent_os.task_finalized` contract so Task 2 stayed focused on resume/persist
  wiring instead of expanding finalization behavior.

### GREEN 2

Command:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
```

Result:

- Passed: `3` files, `23` tests.

## Verification

Targeted tests:

- `rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`
  - PASS

Backend build gate:

- `rtk npm run build --workspace=apps/server`
  - FAIL due to pre-existing unrelated `inventory` TypeScript errors:
    - missing `SELLPIA_WORKBOOK_FORMAT_LABEL` export
    - missing `recommendedCount` in Sellpia summary shape
    - incompatible `"missing_product_name"` warning reason

Backend boot gate:

- `rtk proxy npm run dev:server`
  - Reached Nest watch compilation start, but no clean boot confirmation was
    available before stopping because the workspace currently has unrelated
    server build errors.

## Files Changed

- `apps/server/src/agent-os/adapter/out/runtime/hermes-task-session.ts`
- `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts`
- `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`
- `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`
- `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`
- `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`

## Commit

- `feat: resume hermes agent sessions`

## Fix Section

- Review follow-up added direct-Hermes Operator regression coverage for
  `executeHermes` with `AGENT_OS_OPERATOR_RUNTIME=hermes`.
- The new test verifies the already-implemented path:
  - loads existing `metadata.runtimeThreadId`
  - passes it to Hermes as `resumeSessionId`
  - persists returned `sessionId` through `updateTaskSessionMetadata`
  - includes `sessionId` in `operator.runtime_completed` event data
- No Task 3 usage/cost propagation was added.
