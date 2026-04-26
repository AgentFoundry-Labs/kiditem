@/Users/yhc125/.codex/RTK.md

# KidItem

E-commerce operations automation for kids' products. Sourcing → AI processing → Listing → Operations.

## Essentials

- **npm workspaces monorepo** — PostgreSQL + Prisma + NestJS + Next.js + Python agents.
- **One business domain per session** — bounded cross-layer changes are allowed within one business domain. Do not mix unrelated business domains in one session.
- **No follow-up issues** — apply changes to ALL files in scope. Never defer to TODO.
- **Reference first** — research major OSS projects before introducing new patterns.

## Instruction Files

- Shared multi-agent rules live in `AGENTS.md`.
- `CLAUDE.md` files import the sibling `AGENTS.md` and only carry Claude-specific addenda.
- Nested subdomain guidance under `apps/server/src/*` and `apps/web/src/app/*` is still stored in `CLAUDE.md`. Read those scoped docs before editing those areas until dedicated nested `AGENTS.md` files are added.

## Codex Skills

- Codex skill packs are installed with their source repos under `~/workspace/`.
- `oh-my-codex` source repo: `~/workspace/oh-my-codex`
- Codex uses OMX in **user scope**. Runtime config lives under `~/.codex/`, matching the global Claude-style setup.
- `superpowers` source repo: `~/workspace/superpowers` → discovered via `~/.agents/skills/superpowers`
- `gstack` source repo: `~/workspace/gstack` → discovered via `~/.codex/skills` runtime links
- Codex must be restarted after install or update for newly discovered skills to appear.
- Prefer `gstack-browse` for web browsing workflows when that skill is available.

## OMX Workflow

- Prefer OMX workflow keywords for larger Codex sessions: `$deep-interview` → clarify, `$ralplan` → approve plan, `$team` → parallel execution, `$ralph` → persistent completion loop.
- Run `node ~/workspace/oh-my-codex/dist/cli/omx.js doctor` from the repo root when OMX wiring looks broken.
- Keep the existing project `AGENTS.md` as the source of truth. Do **not** overwrite repo docs with OMX templates unless explicitly requested.

### Claude → Codex skill name mapping

| Claude workflow name | Codex skill name |
|---|---|
| `review` | `gstack-review` |
| `qa` | `gstack-qa` |
| `qa-only` | `gstack-qa-only` |
| `ship` | `gstack-ship` |
| `canary` | `gstack-canary` |
| `benchmark` | `gstack-benchmark` |
| `investigate` | `gstack-investigate` |
| `office-hours` | `gstack-office-hours` |
| `plan-eng-review` | `gstack-plan-eng-review` |
| `plan-ceo-review` | `gstack-plan-ceo-review` |
| `plan-design-review` | `gstack-plan-design-review` |
| `plan-devex-review` | `gstack-plan-devex-review` |
| `autoplan` | `gstack-autoplan` |

`superpowers:*` references remain `superpowers` skill pack names as installed by that project.

## Core Workflow (작업 시작 ~ 완료)

### 1. 시작 전 — scope-local instruction 필독

**파일을 Edit 하기 전 반드시** 해당 경로의 가장 구체적인 instruction file 을 먼저 Read. `AGENTS.md`가 있으면 우선하고, 아직 없는 scope 는 기존 `CLAUDE.md`를 읽는다.

- `apps/server/src/{domain}/` 수정 → [`apps/server/AGENTS.md`](apps/server/AGENTS.md) Domain Guides 표에서 해당 서브도메인 `CLAUDE.md` 확인 후 Read.
- `apps/web/src/app/{domain}/` 수정 → [`apps/web/AGENTS.md`](apps/web/AGENTS.md) Domain Guides 표에서 해당 서브 페이지 `CLAUDE.md` 확인 후 Read.
- 기타 루트 도메인 (`agents/`, `prisma/`, `packages/shared/`, `packages/templates/`) → 해당 루트의 `AGENTS.md` 직접 Read.

### 2. Autonomy Spectrum — 어느 모드로 일할지

| 조건 | 행동 |
|---|---|
| 단일 파일 버그 픽스 | 자율 수정, 체크인 불필요 |
| 2~5 파일 수정 | 스코프 먼저 설명 후 진행 |
| 5+ 파일 또는 신규 피처 | Plan mode. Sign-off 후 코딩 |
| 스키마 변경 (Prisma/Zod) | 항상 Plan mode + 레이어별 영향 분석 |
| Cross-business-domain 변경 | 금지. same-domain cross-layer(`server` + `shared` + direct `web`/root consumer)만 허용. 예외는 ADR + 승인된 plan 선행 |

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
- 커밋: `feat:` `fix:` `refactor:` `docs:` `test:`
- PR body 는 `.github/PULL_REQUEST_TEMPLATE.md` 체크리스트 포함. DB 변경/backfill/init.sql.gz 갱신 여부 명시.
- `gh pr create` pre-hook 이 컨벤션 + 문서 업데이트 체크리스트 자동 실행.
- Instruction file (`AGENTS.md` / `CLAUDE.md`) 를 수정한 PR 은 팀에 공유.

## Cross-Domain Rules

- **No direct DB access from frontend** — must go through NestJS API.
- **Session boundary** — ADR-0019 기준. 같은 business domain이면 `apps/server/src/{domain}` + 필요한 `packages/shared` + 직접 소비하는 `apps/web`/root consumer 를 한 세션에서 함께 수정할 수 있다. 서로 다른 business domain 을 섞는 것은 금지. 경계 예외는 ADR + plan 선행.
- **Workflows must never call LLMs directly** — delegate to agents via `agent_task.create`.
- **No silent model fallback** — `model = model or default` pattern prohibited.
- **No native PG enums** — `String` + app-level validation. Production cast error experience.
- **아키텍처 결정 기록** — 경계·정책·폐기 선언·cross-domain 규칙 전복은 `.claude/docs/decisions/NNNN-*.md` 에 ADR. 기존 ADR 불변, 뒤집을 땐 새 ADR + `superseded-by`. 트리거·운영 규칙: [decisions/README](.claude/docs/decisions/README.md).
- **DB 동기화** — `git pull` 은 DB 를 자동 갱신하지 않는다. 스키마/데이터/init.sql.gz 역할: [prisma/AGENTS.md — DB 동기화](prisma/AGENTS.md#db-동기화--schema-vs-data-중요).

## Structure

```
apps/web/            — Next.js 16 frontend        → apps/web/AGENTS.md
apps/server/         — NestJS 11 backend API      → apps/server/AGENTS.md
agents/              — Python 3.11+ workers       → agents/AGENTS.md
packages/shared/     — @kiditem/shared            → packages/shared/AGENTS.md
packages/templates/  — React detail templates     → packages/templates/AGENTS.md
prisma/              — DB schema source of truth  → prisma/AGENTS.md
  ├─ schema.prisma   — generator + datasource
  └─ models/         — 9개 도메인 파일 (/// @namespace + /// @describe 주석). Prisma multi-file schema (v7 best-practice)
extensions/          — Chrome extensions (product-scraper: 1688/Alibaba, coupang-ads-scraper: 쿠팡 광고센터+Wing)
```

서브도메인별 scoped instruction index 는 위 각 최상위 instruction file 에 표로 정리됨.

## Reference (read when relevant)

- [Design System](DESIGN.md) — 색상, 타이포, 스페이싱, 컴포넌트 패턴 (Tailwind + Lucide)
- **DB schema + 도메인 분류**: [`prisma/models/`](prisma/models/) — 9개 도메인 파일로 분리. 각 모델 위의 `/// @namespace` + `/// @describe` 주석이 도메인 경계 + 의미를 담는다. `prisma generate` 로 자동 동기화 (drift 불가능).
- **Graphify navigation**: [`docs/GRAPHIFY.md`](docs/GRAPHIFY.md), [`docs/ERD.md`](docs/ERD.md), [`graphify-out/schema/`](graphify-out/schema/), [`graphify-out/schema-consumers/`](graphify-out/schema-consumers/) — generated navigation aids only. Source of truth remains Prisma + source code. Regenerate with `npm run graphify:schema` after Prisma/schema-consumer/import-script changes.
- [Architecture](.claude/docs/architecture.md) — data flow, agent runtimes, @kiditem/shared, workflow vs agent boundary
- [Testing Strategy](docs/TESTING.md) — 3-tier (unit mock / e2e HTTP mock / **integration real Postgres**). Race guard·IDOR 검증은 integration tier 로. `npm run db:test:up && npm run db:test:prepare && npm run test:integration`
- [Commands & Environment](.claude/docs/commands.md) — quick start, dev commands, ports, env vars, tests
- [Architecture Decisions (ADR)](.claude/docs/decisions/README.md) — 결정 이력(불변). 트리거·규칙·도메인별 인덱스
