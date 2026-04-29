# web/workflows — Wildcard Invalidation + UseQueryOptions Forwarding

10 파일. 단순 list/detail UI 지만 **invalidation 전략과 hook 합성성** 이 핵심.

## Structure

```
workflows/
├── page.tsx                    # 단순 list + filter
├── components/
│   └── MyWorkflowsSection.tsx  # 단일 섹션 (page 가 거의 thin)
├── hooks/
│   └── useWorkflows.ts         # list/toggle/delete hook exports
└── lib/
    ├── workflow-api.ts         # apiClient 래퍼 (tenant scope is backend-owned)
    └── workflow-types.ts       # WorkflowRunWithSteps
```

## Hooks (useWorkflows.ts)

| Hook | queryKey | endpoint |
|---|---|---|
| `useWorkflows()` | `workflows.list()` | GET /api/workflows |
| `useToggleWorkflow()` | (mutation) | PATCH /api/workflows/:id/toggle |
| `useDeleteWorkflow()` | (mutation) | DELETE /api/workflows/:id |

## 핵심 패턴

### 1. Wildcard Invalidation

모든 mutation 은 `queryKeys.workflows.all` 키로 invalidate. 세분화된 invalidation 안 함.

**의도**: workflow 변경은 list/detail/runs 모두 영향 → 전체 새로고침이 일관성 보장.

### 2. UseQueryOptions Forwarding

```typescript
export function useWorkflows(options?: Partial<UseQueryOptions>) {
  return useQuery({ queryKey, queryFn, ...options });
}
```

caller가 `refetchInterval`, `enabled`, `staleTime` 등 override 가능. **합성성** 있음.

### 3. Tenant Scope = Backend Only

`lib/workflow-api.ts` 는 **`companyId` 를 보내지 않는다.** 모든 endpoint 는 backend 의 `@CurrentCompany()` 가 인증 컨텍스트에서 직접 주입한다 — client 가 보내는 `companyId` 는 untrusted 라 어차피 무시된다. Hook 호출자는 companyId 자체를 알 필요 없음.

### 4. Thin Page Composition

page.tsx:
- 단일 useState (filter)
- useWorkflows() data + loading + error
- → MyWorkflowsSection 에 props pass
- 모달/탭/복잡 state 없음

## Rules

- 모든 workflow 는 backend `@CurrentCompany()` 가 인증 컨텍스트로 회사 스코프. Client 가 `companyId` query/body 를 붙이지 않는다.
- Polling 없음 (`refetchInterval` 사용 안 함, static list)
- Hook 레이어에서 error 처리 안 함 — page.tsx 가 `isApiError` 분기
- Filter state (useState) 는 **UI only**, API 호출에 반영 안 함
- Activation/Delete 모두 동일 invalidation 전략

## Prohibits

- ❌ Page 안에서 inline `useQuery` (전용 hook 만)
- ❌ Polling (static list 의도)
- ❌ Workflow data 클라이언트 변환 (서버 응답 그대로 사용)

## Cross-domain deps

- `@kiditem/shared` — `WorkflowTemplate`, `WorkflowRun`
- `apiClient` — `/api/workflows/*`, `/api/workflow-runs/*` (tenant scope is server-side)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 새 workflow action | `useWorkflows.ts` (mutation hook 추가, wildcard invalidate) + `lib/workflow-api.ts` (apiClient 래퍼) + 백엔드 endpoint |
| Workflow 응답 타입 변경 | `@kiditem/shared/schemas/workflows.ts` + `lib/workflow-types.ts` (WorkflowRunWithSteps) + page rendering |
| Polling 도입 | `useWorkflows.ts` (refetchInterval) — **현재 의도가 polling 안 함, 변경 시 정당화 필요** |
| Filter 서버화 | `useWorkflows()` queryFn (params 전달) + queryKey 에 filter 포함 |
