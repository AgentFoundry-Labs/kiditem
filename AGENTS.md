# KidItem

E-commerce operations automation for kids' products. Sourcing → AI processing → Listing → Operations.

## Essentials

- **npm workspaces monorepo** — PostgreSQL + Prisma + NestJS + Next.js + Python agents.
- **One business domain per session** — bounded cross-layer changes are allowed within one business domain. Do not mix unrelated business domains in one session.
- **No follow-up issues** — apply changes to ALL files in scope. Never defer to TODO.
- **Reference first** — research major OSS projects before introducing new patterns.

## Instruction Files

`AGENTS.md` is the shared instruction authority at every scope. `CLAUDE.md` is
a Claude compatibility shim and should normally contain only:

```text
@AGENTS.md
```

Do not put repo rules, architecture policy, domain contracts, or workflow
decisions in `CLAUDE.md`. If a truly Claude-only local tool workaround is ever
needed, prefer user/global Claude config; add it to repo `CLAUDE.md` only when
it is impossible to express in user config and it must not affect other agents.

Precedence: the most-specific `AGENTS.md` wins, then parent `AGENTS.md` files.
`CLAUDE.md` is not a second source of truth.

## Documentation Artifacts

- Keep durable documentation in `docs/`, scoped `AGENTS.md`, or source-code comments when the rule is inseparable from the implementation.
- When adding durable rules, consolidate or replace nearby rules instead of only appending; remove stale guidance in the same change.
- Do not commit session plans, scratch specs, agent logs, or temporary coordination notes. Use local scratch space outside git for those artifacts.
- Promote only enduring rules or release evidence into git. If a scratch plan produced a permanent convention, copy the final rule into the nearest scoped `AGENTS.md` instead of keeping the plan.
- Environment setup, external tool setup, shared-data setup, browser extension setup, deployment/sync setup, and other collaboration procedures must have an AI-executable Markdown runbook under `docs/runbooks/` or the nearest scoped documentation. Do not rely on chat history as the source of truth.
- AI-executable runbooks must separate human prerequisites from agent actions, avoid recording secrets, list exact env vars/paths/files, include expected directory shape, verification commands, success criteria, blocker criteria, and a final report format.
- When a setup task has a runbook, agents should read it and execute the safe local steps directly. Ask the user only for credentials, account permissions, missing source files, or destructive/external-account actions.

## Core Workflow (작업 시작 ~ 완료)

### Branch Model

- `feature/*`, `fix/*` → normal work branches.
- `develop` → shared development integration branch. Regular PRs target
  `develop`; merging here does **not** deploy staging.
- `main` → staging deployment branch. Promote `develop` to `main` only when the
  collected changes are ready for staging verification, then run the staging
  deploy workflow manually on `main`.
- No direct push to `main`.

### 0. 환경 부트스트랩 — 새 워크트리 / 새 머신 / preview 인증 필요할 때

```bash
./bin/dev-bootstrap.sh
```

env 파일 (`.env`, `apps/web/.env.local`) 동기화 + `npm install` + dev preview 세션 callback 발급. 발급 전 local `User` mirror 와 active `OrganizationMembership` 를 확인하므로, AI 프리뷰가 출력 URL 로 진입하면 실제 user/org 컨텍스트가 있는 Supabase 세션이 만들어진다. 토큰 만료 (~1h) 시 재실행. 자세히: [`docs/runbooks/dev-preview-with-auth.md`](docs/runbooks/dev-preview-with-auth.md). 처음 셋업이면 [`docs/runbooks/auth-supabase.md`](docs/runbooks/auth-supabase.md) 먼저.

### 1. 시작 전 — scope-local instruction 필독

**파일을 Edit 하기 전 반드시** 해당 경로의 가장 구체적인 `AGENTS.md` 를 먼저 Read.

- `apps/server/src/{domain}/` 수정 → [`apps/server/AGENTS.md`](apps/server/AGENTS.md) Domain Guides 표에서 해당 서브도메인 `AGENTS.md` 확인 후 Read.
- `apps/web/src/app/{domain}/` 수정 → [`apps/web/AGENTS.md`](apps/web/AGENTS.md) Domain Guides 표에서 해당 서브 페이지 `AGENTS.md` 확인 후 Read.
- 기타 루트 도메인 (`agents/`, `prisma/`, `packages/shared/`, `packages/templates/`, `scripts/`) → 해당 루트의 `AGENTS.md` 직접 Read.

### 2. Autonomy Spectrum — 어느 모드로 일할지

| 조건 | 행동 |
|---|---|
| 단일 파일 버그 픽스 | 자율 수정, 체크인 불필요 |
| 2~5 파일 수정 | 스코프 먼저 설명 후 진행 |
| 5+ 파일 또는 신규 피처 | Plan mode. Sign-off 후 코딩 |
| 스키마 변경 (Prisma/Zod) | 항상 Plan mode + 레이어별 영향 분석 |
| Cross-business-domain 변경 | 금지. same-domain cross-layer(`server` + `shared` + direct `web`/root consumer)만 허용. 예외는 boundary plan 선행 (root AGENTS.md "Cross-Domain Rules" 의 Session boundary 규칙 참고) |

### 3. Verification — 완료 주장 전 필수 실행

| 변경 종류 | 검증 명령 |
|---|---|
| Backend | `npm run dev:server` (tsc + vitest 는 DI 에러 못 잡음) |
| Frontend | `npm run build --workspace=apps/web` |
| Schema | `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build` |
| NestJS 모듈/서비스 추가 | `npm run dev:server` (부팅까지 확인) |

증거 없이 "완료" 주장 금지.

### 4. Commit / PR

- 브랜치: `feat/{issue}-{desc}`, `fix/{desc}`. `main` 직접 push 금지.
- 일반 작업 PR base 는 `develop`. 스테이징 검증 준비가 끝난 묶음만
  `develop` → `main` 으로 승격하고, 필요할 때 수동 staging deploy 를 실행한다.
- 커밋: `feat:` `fix:` `refactor:` `docs:` `test:`
- PR body 는 `.github/PULL_REQUEST_TEMPLATE.md` 체크리스트 포함. DB 변경/backfill/개발 데이터 bundle 변경 여부 명시.
- `gh pr create` pre-hook 이 컨벤션 + 문서 업데이트 체크리스트 자동 실행.
- Instruction file (`AGENTS.md` / `CLAUDE.md`) 를 수정한 PR 은 팀에 공유.
- Review 는 diff correctness 만 보지 않는다. reviewer 는 PR 본문과 가장 구체적인
  `AGENTS.md` 를 대조해 scope / reconstruction trigger / verification gate 가
  맞는지 먼저 판정한다. Trigger 가 있는데도 PR 이 "단순 기능" 으로 축소돼 있으면
  approve 하지 말고 scope 를 재분류한다.

## Cross-Domain Rules

- **No direct DB access from frontend** — must go through NestJS API.
- **Session boundary** — 같은 business domain 이면 `apps/server/src/{domain}` + 필요한 `packages/shared` + 직접 소비하는 `apps/web`/root consumer 를 한 세션에서 함께 수정할 수 있다. 서로 다른 business domain 을 섞는 것은 금지. 경계 예외는 boundary plan + 명시적 PR 사인오프로 처리.
- **Workflows must never call LLMs directly** — delegate to agents via `agent_task.create`.
- **No silent model fallback** — `model = model or default` 패턴 금지. 모델 미지정은 explicit error.
- **No native PG enums** — `String` + app-level validation. Production cast error experience.
- **No `$queryRawUnsafe`** — Prisma raw SQL 은 항상 tagged template (`$queryRaw\`...\``). 동적 식별자가 필요하면 whitelist + tagged interpolation.
- **Organization boundary** — 코드와 DB 의 SaaS/customer boundary 이름은 `Organization` / `organizationId` 다. `tenant` 는 아키텍처 설명 용어로만 쓰고 변수명·컬럼명·API 계약에는 쓰지 않는다. 회사 법인 정보는 `LegalEntity`, 마켓플레이스/스토어 계정은 `ChannelAccount` 로 분리한다.
- **Multi-tenant scope** — 모든 mutating service 는 `@CurrentOrganization()` 로 받은 `organizationId` 를 WHERE/INSERT 에 포함. 단일 리소스 GET/PATCH/DELETE 는 `findFirst({ where: { id, organizationId } })`. `findUnique({ where: { id } })` 금지 (IDOR).
- **Membership source of truth** — 사용자의 현재 조직과 조직 내 role 은 `OrganizationMembership` 이 source of truth. `User` 에 직접 `organizationId` 를 두지 않는다. 시스템/챗봇 사용자는 활성 membership 이 없을 수 있고, 도메인 HTTP 라우트는 `OrganizationScopeGuard` 가 이를 차단한다.
- **DB 동기화** — `git pull` 은 DB 를 자동 갱신하지 않는다. 스키마는 `db:push`, 공유 개발 데이터는 Google Drive dev data profile sync 로 맞춘다: [prisma/AGENTS.md — DB 동기화](prisma/AGENTS.md#db-동기화--schema-vs-data-중요), [docs/DEV_DATA_BUNDLES.md](docs/DEV_DATA_BUNDLES.md), [docs/runbooks/google-drive-dev-data.md](docs/runbooks/google-drive-dev-data.md).
- **신규 영구 규칙** — incident-driven 또는 cross-domain 새 규칙은 해당 scope 의 `AGENTS.md` 본문에 직접 등록. 별도 결정 이력 폴더는 두지 않는다 (별도 결정 문서 체계 폐지, 2026-04-26).

## Codebase Reconstruction Rules

Reconstruction is a platform-boundary cleanup track, not permission to mix
unrelated business rewrites. Durable reconstruction contracts live in this
file and the nearest scoped `AGENTS.md`; session plans and temporary scratch
notes stay out of git.

- **Review trigger contract** — 10+ files, 500+ line services/components,
  LLM/provider/media/storage/fetch/runtime/sink/reconcile changes, or
  cross-layer controls require explicit reconstruction classification in the
  PR body/review before approval. If the needed contract/test/gate is missing,
  fix scope before merge; do not park it as a vague follow-up.

- **Rules before deletion** — record contract, scanner, or regression-test gates before deleting legacy implementation.
- **Boundary exception is narrow** — organization guards, raw SQL policy, scanner scripts, shared export topology, and dependency tooling may cross domains. Business logic rewrites still use one owner domain per PR.
- **Organization service contract** — organization-owned services receive `organizationId` as an explicit argument from `@CurrentOrganization()`. Client-provided `organizationId` is not trusted.
- **Raw SQL contract** — production raw SQL uses Prisma tagged templates only. Unsafe raw SQL APIs remain banned even when inputs appear sanitized.
- **Shared contract** — do not expand the `@kiditem/shared` root barrel for new domains. Add or use domain subpath exports instead.
- **Large-file contract** — do not add substantial behavior to 700+ line services/components. Write a split/replacement plan first.
- **Frontend DB boundary** — frontend packages must not depend on Prisma, `pg`, or direct database access. Data flows through NestJS APIs.
- **Verification contract** — every reconstruction PR reports the exact gate it made green. If a gate itself is broken, fix the gate before using it as evidence.
- **Backend architecture contract** — backend reconstruction follows the
  backend contract in [`apps/server/AGENTS.md`](apps/server/AGENTS.md):
  Domain-first modular architecture with Application orchestration and
  selective Hexagonal Ports.
- **Owner domain boundary** — backend top-level folders represent owner domains/platforms, not DB tables or frontend pages. Boundaries are chosen by data ownership, mutation authority, transaction boundary, and invariants.
- **Pure domain rule** — reconstructed `domain/` code must not depend on NestJS, Prisma, HTTP/provider SDKs, workflow runtime, AgentRegistry, filesystem, or panel/event infrastructure.
- **Application port rule** — reconstructed application services depend on `application/port/out/*` contracts for DB, cross-domain, provider, Agent OS, workflow, filesystem, and panel/event boundaries. Nest modules bind those ports to outgoing adapters. Do not import concrete `adapter/out/**` implementations or other owner-domain services directly from `application/service/**`.
- **Adapter naming rule** — reconstructed DB access lives behind application ports and outgoing adapters. The scoped plan chooses the concrete adapter lane and concise names, for example Inventory uses `adapter/out/repository/*.repository.adapter.ts`. Do not force global DAO/Repository naming, do not keep `*persistence.ts` as final naming, and do not repeat folder roles in file names unless multiple implementations require a qualifier such as `prisma`, `memory`, or a provider name.
- **Legacy module rule** — flat `Controller -> Service -> PrismaService` modules are tolerated only as transitional legacy CRUD. New or materially rewritten domains should move behavior behind `adapter/application/domain` structure using port/adapter boundaries.
- **Backend folder rule** — adding a new `apps/server/src/{top-level}` folder requires owner-domain justification in the scoped plan or instruction file. Small table-shaped modules should be folded into their owner domain during reconstruction.
- **Directory architecture rule** — backend and web directory ownership/structure live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Adding, moving, or changing a top-level backend folder, frontend route group, route leaf, or shared frontend root must update that directory map in the same PR.

## Structure

```
apps/web/            — Next.js 16 frontend        → apps/web/AGENTS.md
apps/server/         — NestJS 11 backend API      → apps/server/AGENTS.md
agents/              — Python 3.11+ workers       → agents/AGENTS.md
packages/shared/     — @kiditem/shared            → packages/shared/AGENTS.md
packages/templates/  — React detail templates     → packages/templates/AGENTS.md
prisma/              — DB schema source of truth  → prisma/AGENTS.md
  ├─ schema.prisma   — generator + datasource
  └─ models/         — 10 domain files (/// @namespace + /// @describe comments). Prisma multi-file schema (v7 best-practice)
scripts/             — repo automation            → scripts/AGENTS.md
extensions/          — Chrome extensions (product-scraper: 1688/Alibaba, coupang-ads-scraper: 쿠팡 광고센터+Wing)
```

서브도메인별 scoped instruction index 는 위 각 최상위 instruction file 에 표로 정리됨.

## Reference (read when relevant)

- [Design System](DESIGN.md) — 색상, 타이포, 스페이싱, 컴포넌트 패턴 (Tailwind + Lucide)
- **DB schema + 도메인 분류**: [`prisma/models/`](prisma/models/) — 10 domain files. 각 모델 위의 `/// @namespace` + `/// @describe` 주석이 도메인 경계 + 의미를 담는다. `prisma generate` 로 자동 동기화 (drift 불가능).
- **Graphify navigation**: [`docs/GRAPHIFY.md`](docs/GRAPHIFY.md), [`docs/ERD.md`](docs/ERD.md), [`docs/erd/`](docs/erd/), [`graphify-out/schema/`](graphify-out/schema/), [`graphify-out/schema-consumers/`](graphify-out/schema-consumers/) — generated navigation aids only. Source of truth remains Prisma + source code. Regenerate with `npm run graphify:schema` after Prisma/schema-consumer/import-script changes.
- **Runbooks**: [`docs/runbooks/`](docs/runbooks/) — AI-executable setup and operations procedures. Prefer these over chat memory for environment or collaboration setup.
- [Architecture](docs/ARCHITECTURE.md) — current backend/frontend/reconstruction sources of truth
- [Testing Strategy](docs/TESTING.md) — 3-tier (unit mock / e2e HTTP mock / **integration real Postgres**). Race guard·IDOR 검증은 integration tier 로. `npm run db:test:up && npm run db:test:prepare && npm run test:integration`
- [Environment Variables](docs/runbooks/environment-variables.md) — env var inventory and verification commands
