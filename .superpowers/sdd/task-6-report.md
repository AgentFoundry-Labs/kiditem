## Task 6 Report: Wire Agent Office Page And Conversation Commands

### Scope
- Added route-local `useAgentOffice` under `apps/web/src/app/(automation)/agents/hooks/`.
- Replaced the old `/agents` table page with `AgentOfficeShell` composition in `apps/web/src/app/(automation)/agents/page.tsx`.
- Added the page regression test at `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx`.

### TDD Record
- RED:
  - Command: `rtk npm run test --workspace=apps/web -- 'src/app/(automation)/agents/__tests__/page.spec.tsx'`
  - Result: failed as expected because `page.tsx` still rendered the old React Query table screen and threw `No QueryClient set, use QueryClientProvider to set one`.
- GREEN:
  - Command: `rtk npm run test --workspace=apps/web -- 'src/app/(automation)/agents/__tests__/page.spec.tsx' 'src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx' 'src/app/(automation)/agents/components/AgentCommandBar.spec.tsx' 'src/app/(automation)/agents/lib/agent-office-model.spec.ts'`
  - Result: passed, 4 files / 10 tests green.

### Implementation Notes
- Kept `selectedNodeId` initialized to `null` in `useAgentOffice` so `AgentOfficeShell` preserves its intentional no-selection inspector state.
- Wired polling through React Query `refetchInterval` for runs, requests, approvals, conversations, cost events, and authorization events.
- Routed command submission through `createConversation` first, then `sendMessage` once a conversation exists.
- Kept all backend access inside the route-local `agentOsApi` wrapper and did not send `organizationId`.

### Verification
- Passed:
  - `rtk npm run test --workspace=apps/web -- 'src/app/(automation)/agents/__tests__/page.spec.tsx' 'src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx' 'src/app/(automation)/agents/components/AgentCommandBar.spec.tsx' 'src/app/(automation)/agents/lib/agent-office-model.spec.ts'`
- Attempted but blocked by unrelated existing issue:
  - `rtk npm run build --workspace=apps/web`
  - Failure source: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaSync.tsx` imports missing `SELLPIA_WORKBOOK_ACCEPT` and `SELLPIA_WORKBOOK_FORMAT_LABEL` exports from `@kiditem/shared/inventory`.

### Commit
- Intended commit message: `feat: wire agent office hq`

### Fixes After Review
- Issue 1 — conversation continuity:
  - Added deterministic conversation hydration in `useAgentOffice` from `conversationsQuery.data` when local `conversationId` is still `null`.
  - Selection rule is route-local and stable: prefer the most recent `active` conversation; if none are active, fall back to the latest conversation by activity time.
  - `submitCommand` now sends into that resolved conversation after reload/return visits instead of always creating a fresh conversation.
- Issue 2 — initial loading state:
  - Tightened `isPending` so the page remains in the skeleton until every HQ dataset required by `buildAgentOfficeModel` has finished its initial load or errored.
  - Kept `isFetching` separate for background refresh/polling state.

### Focused Fix Tests
- Added `apps/web/src/app/(automation)/agents/hooks/useAgentOffice.spec.tsx` covering:
  - reload continuity through the most recent active conversation
  - initial pending state across the full HQ query set
- Verification:
  - `rtk npm run test --workspace=apps/web -- 'src/app/(automation)/agents/hooks/useAgentOffice.spec.tsx'`
  - `rtk npm run test --workspace=apps/web -- 'src/app/(automation)/agents/__tests__/page.spec.tsx' 'src/app/(automation)/agents/hooks/useAgentOffice.spec.tsx' 'src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx' 'src/app/(automation)/agents/components/AgentCommandBar.spec.tsx' 'src/app/(automation)/agents/lib/agent-office-model.spec.ts'`
