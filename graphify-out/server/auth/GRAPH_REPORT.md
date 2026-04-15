# Graph Report - apps/server/src/auth  (2026-04-14)

## Corpus Check
- Corpus is ~2,824 words - fits in a single context window. You may not need a graph.

## Summary
- 69 nodes · 60 edges · 21 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (12n)|Cluster 0 (12n)]]
- [[_COMMUNITY_Cluster 1 (9n)|Cluster 1 (9n)]]
- [[_COMMUNITY_Cluster 2 (8n)|Cluster 2 (8n)]]
- [[_COMMUNITY_Cluster 3 (5n)|Cluster 3 (5n)]]
- [[_COMMUNITY_Cluster 4 (4n)|Cluster 4 (4n)]]
- [[_COMMUNITY_Cluster 5 (4n)|Cluster 5 (4n)]]
- [[_COMMUNITY_Cluster 6 (4n)|Cluster 6 (4n)]]
- [[_COMMUNITY_Cluster 7 (3n)|Cluster 7 (3n)]]
- [[_COMMUNITY_Cluster 8 (2n)|Cluster 8 (2n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (2n)|Cluster 10 (2n)]]
- [[_COMMUNITY_Cluster 11 (2n)|Cluster 11 (2n)]]
- [[_COMMUNITY_Cluster 12 (2n)|Cluster 12 (2n)]]
- [[_COMMUNITY_Cluster 13 (2n)|Cluster 13 (2n)]]
- [[_COMMUNITY_Cluster 14 (2n)|Cluster 14 (2n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]
- [[_COMMUNITY_Cluster 17 (1n)|Cluster 17 (1n)]]
- [[_COMMUNITY_Cluster 18 (1n)|Cluster 18 (1n)]]
- [[_COMMUNITY_Cluster 19 (1n)|Cluster 19 (1n)]]
- [[_COMMUNITY_Cluster 20 (1n)|Cluster 20 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `auth.types.ts` - 6 edges
2. `__tests__/` - 6 edges
3. `guards/company-scope.guard.ts` - 5 edges
4. `guards/roles.guard.ts` - 5 edges
5. `CompanyScopeGuard — auth + companyId 강제` - 5 edges
6. `RolesGuard — role 메타데이터 기반 권한 검증` - 5 edges
7. `AuthUser 타입 (id, companyId, role, type, email)` - 4 edges
8. `@CurrentCompany() 데코레이터 — companyId 반환 + 이중 방어` - 4 edges
9. `DevAuthMiddleware` - 3 edges
10. `RolesGuard` - 3 edges

## Surprising Connections (you probably didn't know these)
- `@SkipAuth() 데코레이터 — CompanyScopeGuard bypass` --rationale_for--> `decorators/skip-auth.decorator.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 7_
- `CompanyScopeGuard — auth + companyId 강제` --rationale_for--> `guards/company-scope.guard.ts`  [INFERRED]
  CLAUDE.md → CLAUDE.md  _Bridges community 1 → community 2_
- `auth.types.ts` --modification_triggers--> `decorators/current-company.decorator.ts`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 0 → community 3_
- `auth.types.ts` --modification_triggers--> `guards/company-scope.guard.ts`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 0 → community 1_
- `decorators/current-company.decorator.ts` --modification_triggers--> `__tests__/`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 3 → community 1_

## Communities

### Community 0 - "Cluster 0 (12n)"
Cohesion: 0.17
Nodes (12): auth.module.ts, auth.types.ts, decorators/current-user.decorator.ts, middleware/dev-auth.middleware.ts, AuthUser 타입 (id, companyId, role, type, email), @CurrentUser() 데코레이터 — request.authUser 반환, DevAuthMiddleware — 개발용 인증 주입 (prod 블록), DevAuthMiddleware 직접 인스턴스화 금지 (+4 more)

### Community 1 - "Cluster 1 (9n)"
Cohesion: 0.31
Nodes (9): app.module.ts, guards/company-scope.guard.ts, decorators/roles.decorator.ts, guards/roles.guard.ts, decorators/skip-auth.decorator.ts, __tests__/, 가드 실행 순서: CompanyScope → Roles → Throttler, @Roles(...roles) 데코레이터 — ROLES_METADATA_KEY, string 자유 (+1 more)

### Community 2 - "Cluster 2 (8n)"
Cohesion: 0.29
Nodes (8): CompanyScopeGuard — auth + companyId 강제, RolesGuard — role 메타데이터 기반 권한 검증, 서비스 레이어에서 companyId 재검증 금지, @UseGuards(RolesGuard) per-route 금지, Guards는 글로벌(APP_GUARD) 등록, RolesGuard 단일 string 매칭 (array intersection 아님), @Roles 없으면 RolesGuard pass-through, 서비스는 companyId 재검증 불필요 (guard가 보장)

### Community 3 - "Cluster 3 (5n)"
Cohesion: 0.4
Nodes (5): decorators/current-company.decorator.ts, @CurrentCompany() 데코레이터 — companyId 반환 + 이중 방어, 데코레이터에서 companyId 캐싱 금지, Rationale: 데코레이터가 가드 후에도 재검증 (이중 방어), @CurrentCompany는 가드 통과 후에도 재검증 (이중 방어)

### Community 4 - "Cluster 4 (4n)"
Cohesion: 0.5
Nodes (1): DevAuthMiddleware

### Community 5 - "Cluster 5 (4n)"
Cohesion: 0.5
Nodes (1): RolesGuard

### Community 6 - "Cluster 6 (4n)"
Cohesion: 0.5
Nodes (1): CompanyScopeGuard

### Community 7 - "Cluster 7 (3n)"
Cohesion: 0.67
Nodes (3): @SkipAuth() 데코레이터 — CompanyScopeGuard bypass, 민감/admin 라우트에 @SkipAuth 금지, @SkipAuth는 health/public 전용

### Community 8 - "Cluster 8 (2n)"
Cohesion: 1.0
Nodes (1): AuthModule

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Cluster 10 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (2n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (2n)"
Cohesion: 1.0
Nodes (2): Dev User 해석 우선순위: 헤더 → query → env, Rationale: EventSource는 커스텀 헤더 못 보냄 → query param 지원

### Community 14 - "Cluster 14 (2n)"
Cohesion: 1.0
Nodes (2): agent-registry.controller.ts, 새 보호 엔드포인트 추가 패턴 (@CurrentCompany + @Roles)

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Cluster 16 (1n)"
Cohesion: 1.0
Nodes (1): auth/CLAUDE.md

### Community 17 - "Cluster 17 (1n)"
Cohesion: 1.0
Nodes (1): 인증 흐름: Middleware → Guards → Decorators → Service

### Community 18 - "Cluster 18 (1n)"
Cohesion: 1.0
Nodes (1): Error: auth_required (401)

### Community 19 - "Cluster 19 (1n)"
Cohesion: 1.0
Nodes (1): Error: no_company_context (401)

### Community 20 - "Cluster 20 (1n)"
Cohesion: 1.0
Nodes (1): Error: insufficient_role (403)

## Knowledge Gaps
- **28 isolated node(s):** `AuthModule`, `auth/CLAUDE.md`, `auth.module.ts`, `agent-registry.controller.ts`, `@CurrentUser() 데코레이터 — request.authUser 반환` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 8 (2n)`** (2 nodes): `AuthModule`, `auth.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `currentUserFactory()`, `current-user.decorator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (2n)`** (2 nodes): `currentCompanyFactory()`, `current-company.decorator.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (2n)`** (2 nodes): `skip-auth.decorator.ts`, `SkipAuth()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (2n)`** (2 nodes): `roles.decorator.ts`, `Roles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (2n)`** (2 nodes): `Dev User 해석 우선순위: 헤더 → query → env`, `Rationale: EventSource는 커스텀 헤더 못 보냄 → query param 지원`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (2n)`** (2 nodes): `agent-registry.controller.ts`, `새 보호 엔드포인트 추가 패턴 (@CurrentCompany + @Roles)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `auth.types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `auth/CLAUDE.md`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (1n)`** (1 nodes): `인증 흐름: Middleware → Guards → Decorators → Service`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (1n)`** (1 nodes): `Error: auth_required (401)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (1n)`** (1 nodes): `Error: no_company_context (401)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (1n)`** (1 nodes): `Error: insufficient_role (403)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `auth.types.ts` connect `Cluster 0 (12n)` to `Cluster 1 (9n)`, `Cluster 3 (5n)`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Why does `guards/company-scope.guard.ts` connect `Cluster 1 (9n)` to `Cluster 0 (12n)`, `Cluster 2 (8n)`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `guards/roles.guard.ts` connect `Cluster 1 (9n)` to `Cluster 0 (12n)`, `Cluster 2 (8n)`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **What connects `AuthModule`, `auth/CLAUDE.md`, `auth.module.ts` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._