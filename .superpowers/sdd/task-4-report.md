# Task 4 Report: Build Agent Office API Client And View Model

## Summary

Implemented the route-local Agent OS HQ data layer for `apps/web/src/app/(automation)/agents/lib/`:

- expanded `agent-os-api.ts` with conversation, approval, cost, authorization, and graph endpoints
- added `queryKeys.agents.hq` and `queryKeys.agents.hqMessages`
- created a pure `buildAgentOfficeModel(...)` view-model helper with durable regression tests

No UI components or page wiring from Tasks 5/6 were added.

## Files Changed

- `apps/web/src/lib/query-keys.ts`
  - Added Agent HQ cache keys:
    - `queryKeys.agents.hq()`
    - `queryKeys.agents.hqMessages(conversationId)`
- `apps/web/src/app/(automation)/agents/lib/agent-os-api.ts`
  - Added route-local API wrappers for:
    - conversations list/create
    - conversation messages list/send
    - conversation graph
    - approvals list/resolve
    - cost events list
    - authorization events list
- `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`
  - Added `AgentOfficeNodeStatus`, `AgentOfficeNode`, `AgentOfficeActivity`, `AgentOfficeViewModel`
  - Added `BuildAgentOfficeModelInput`
  - Implemented node status derivation, office positions, activity flattening/sorting, and totals
- `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`
  - Added regression coverage for status derivation and newest-first activity ordering

## TDD Notes

Red phase was verified first:

- `rtk npm run test --workspace=apps/web -- src/app/\(automation\)/agents/lib/agent-office-model.spec.ts`
- Failed because `./agent-office-model` did not exist yet:
  - `Failed to resolve import "./agent-office-model"`

Green phase after implementation:

- The same targeted spec passed with `2 passed (2)`.

## Verification

Passed:

- `rtk npm run test --workspace=apps/web -- src/app/\(automation\)/agents/lib/agent-office-model.spec.ts`

Attempted but blocked by unrelated existing branch issues:

- `rtk npm run build --workspace=apps/web`
  - Fails in `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx`
  - Missing exports from `@kiditem/shared/inventory`:
    - `SELLPIA_WORKBOOK_ACCEPT`
    - `SELLPIA_WORKBOOK_FORMAT_LABEL`
- `rtk npx vitest run` in `apps/web`
  - Existing failures outside Task 4:
    - `src/__tests__/next-config.spec.ts` (`fileURLToPath(new URL('../..', import.meta.url))`)
    - `src/components/__tests__/ReadinessModal.spec.tsx` (`localStorage.clear is not a function`)
    - `src/app/(inventory)/inventory-hub/components/SellpiaSync.test.tsx` (timeouts)
    - `src/app/(orders)/order-collection/lib/order-detect.spec.ts` (`window.localStorage.clear is not a function`)

## Repo-Contract Adaptation

- The task brief’s sample data used `AgentRunSummary.taskKey` as a required string.
- In the current shared contract, `@kiditem/shared/agent-os` defines `AgentRunSummary.taskKey` as `string | null`.
- I followed the actual shared schema and kept the view model compatible with nullable `taskKey` without changing the requested API surface.

## Result

Task 4 scope is complete: the future Agent OS HQ screen now has route-local Nest API wrappers, dedicated React Query keys, and a pure tested view-model builder ready for Tasks 5/6 UI wiring.

## Fix Section

Review follow-up addressed two correctness issues:

- `agentOsApi.resolveApproval(...)`
  - Added a route-local `AgentApprovalResolutionResponse` interface.
  - Updated the wrapper to return the actual backend payload shape:
    `{ approvalRequestId, requestId, status }`
  - This now matches `AgentApprovalService.resolveApproval(...)` instead of incorrectly pretending the endpoint returns a full `AgentApprovalRequestSummary`.
- `buildAgentOfficeModel(...)`
  - Updated claimed request handling so `claimed` contributes to `activeRunCount` and `working` status when there is no running run yet.
  - `pending` remains the only request state that contributes to `waiting`.

Focused regression coverage added:

- `agent-office-model.spec.ts`
  - Added a spec proving a claimed request with no running run marks the node `working`, increments `activeRunCount`, and does not inflate `runningRuns`.

Focused verification for the review fix:

- `rtk npm run test --workspace=apps/web -- src/app/\(automation\)/agents/lib/agent-office-model.spec.ts`
