# KidItem

E-commerce operations automation for kids' products. Sourcing → AI processing → Listing → Operations.

## Essentials

- **npm workspaces monorepo** — PostgreSQL + Prisma + NestJS + Next.js + Python agents.
- **One domain per session** — no cross-domain modifications.
- **No follow-up issues** — apply changes to ALL files in scope. Never defer to TODO.
- **Reference first** — research major OSS projects before introducing new patterns.

## Core Workflow (작업 시작 ~ 완료)

### 1. 시작 전 — CLAUDE.md 필독

**파일을 Edit 하기 전 반드시** 해당 경로의 `CLAUDE.md` 를 먼저 Read. Subagent 위임 시에도 이 규칙을 프롬프트에 명시.

- `apps/server/src/{domain}/` 수정 → [`apps/server/CLAUDE.md`](apps/server/CLAUDE.md) Domain Guides 표에서 해당 서브도메인 CLAUDE.md 확인 후 Read.
- `apps/web/src/app/{domain}/` 수정 → [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) Domain Guides 표에서 해당 서브 페이지 CLAUDE.md 확인 후 Read.
- 기타 루트 도메인 (`agents/`, `prisma/`, `packages/shared/`, `packages/templates/`) → 해당 루트의 `CLAUDE.md` 직접 Read.

### 2. Autonomy Spectrum — 어느 모드로 일할지

| 조건 | 행동 |
|---|---|
| 단일 파일 버그 픽스 | 자율 수정, 체크인 불필요 |
| 2~5 파일 수정 | 스코프 먼저 설명 후 진행 |
| 5+ 파일 또는 신규 피처 | Plan mode. Sign-off 후 코딩 |
| 스키마 변경 (Prisma/Zod) | 항상 Plan mode + 레이어별 영향 분석 |
| Cross-domain 변경 | 금지. 불가피하면 세션 분리 |

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
- CLAUDE.md 를 수정한 PR 은 팀에 공유.

## Cross-Domain Rules

- **No direct DB access from frontend** — must go through NestJS API.
- **Workflows must never call LLMs directly** — delegate to agents via `agent_task.create`.
- **No silent model fallback** — `model = model or default` pattern prohibited.
- **No native PG enums** — `String` + app-level validation. Production cast error experience.
- **아키텍처 결정 기록** — 경계·정책·폐기 선언·cross-domain 규칙 전복은 `.claude/docs/decisions/NNNN-*.md` 에 ADR. 기존 ADR 불변, 뒤집을 땐 새 ADR + `superseded-by`. 트리거·운영 규칙: [decisions/README](.claude/docs/decisions/README.md).
- **DB 동기화** — `git pull` 은 DB 를 자동 갱신하지 않는다. 스키마/데이터/init.sql.gz 역할: [prisma/CLAUDE.md — DB 동기화](prisma/CLAUDE.md#db-동기화--schema-vs-data-중요).

## Structure

```
apps/web/            — Next.js 16 frontend        → apps/web/CLAUDE.md
apps/server/         — NestJS 11 backend API      → apps/server/CLAUDE.md
agents/              — Python 3.11+ workers       → agents/CLAUDE.md
packages/shared/     — @kiditem/shared            → packages/shared/CLAUDE.md
packages/templates/  — React detail templates     → packages/templates/CLAUDE.md
prisma/              — DB schema source of truth  → prisma/CLAUDE.md
  ├─ schema.prisma   — generator + datasource
  └─ models/         — 9개 도메인 파일 (/// @namespace + /// @describe 주석). Prisma multi-file schema (v7 best-practice)
extensions/          — Chrome extensions (product-scraper: 1688/Alibaba, coupang-ads-scraper: 쿠팡 광고센터+Wing)
```

서브도메인별 CLAUDE.md Index 는 위 각 최상위 CLAUDE.md 에 표로 정리됨.

## Reference (read when relevant)

- [Design System](DESIGN.md) — 색상, 타이포, 스페이싱, 컴포넌트 패턴 (Tailwind + Lucide)
- **DB schema + 도메인 분류**: [`prisma/models/`](prisma/models/) — 9개 도메인 파일로 분리. 각 모델 위의 `/// @namespace` + `/// @describe` 주석이 도메인 경계 + 의미를 담는다. `prisma generate` 로 자동 동기화 (drift 불가능).
- [Architecture](.claude/docs/architecture.md) — data flow, agent runtimes, @kiditem/shared, workflow vs agent boundary
- [Testing Strategy](docs/TESTING.md) — 3-tier (unit mock / e2e HTTP mock / **integration real Postgres**). Race guard·IDOR 검증은 integration tier 로. `npm run db:test:up && npm run db:test:prepare && npm run test:integration`
- [Commands & Environment](.claude/docs/commands.md) — quick start, dev commands, ports, env vars, tests
- [Architecture Decisions (ADR)](.claude/docs/decisions/README.md) — 결정 이력(불변). 트리거·규칙·도메인별 인덱스

## Skill routing

요청이 아래 트리거와 매칭되면 **Skill 툴을 first action 으로** 호출 (직접 답변 금지):

- 제품 아이디어, 브레인스토밍 → **office-hours**
- 버그, 500 에러, "왜 이게 안 돼" → **investigate**
- Ship / deploy / PR 생성 → **ship**
- QA / 사이트 테스트 / 버그 찾기 → **qa**
- 코드 리뷰 / diff 체크 → **review**
- Ship 후 문서 업데이트 → **document-release**
- Weekly retro → **retro**
- 디자인 시스템 / 브랜드 → **design-consultation**
- 비주얼 감사 / 디자인 폴리시 → **design-review**
- 아키텍처 리뷰 → **plan-eng-review**
- 진행 저장 / 체크포인트 / 재개 → **checkpoint**
- 코드 퀄리티 / 헬스 체크 → **health**
