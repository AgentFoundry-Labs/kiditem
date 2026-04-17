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

## Subagent / Team routing

복잡도에 따라 패턴 분기:

| 상황 | 패턴 |
|---|---|
| 단일 파일 버그 픽스, 1-2 파일 수정 | **직접 작업** (subagent 불필요) |
| 중간 복잡도 (3-5 파일, 단일 도메인) | **`kiditem-implementer` subagent 1회 dispatch** + 결과 수령 후 `/review` skill |
| 복잡 작업 (5+ 파일, 신규 피처, legacy 포팅, multi-domain) | **`TeamCreate`** + 3-role 스폰 (아래) |
| Research-only (파일 읽기만) | `Explore` 또는 `researcher` subagent |
| Plan 기반 다단계 실행 (plan.md 이미 있음) | `superpowers:subagent-driven-development` |

### Team 기반 workflow (복잡 작업)

1. `TeamCreate({ team_name: "kiditem-<feature>" })` — 팀 + 공유 TaskList 생성
2. 팀에 3 role 스폰 (`Agent` 툴 + `team_name` + `name`):
   - `kiditem-implementer` × 1 (기본; 독립 병렬 태스크 있으면 명시적으로 N)
   - `kiditem-reviewer` × 2 (`MODE: spec` + `MODE: quality` 각 1)
   - `kiditem-qa-verifier` × 1
3. `TaskCreate` 로 태스크 투입. Implementer 가 claim → 구현 → 3 리뷰어에게 DM
4. 리뷰 루프는 **teammate 간 직접 DM** 으로 닫힘 (내가 중계 안 함)
5. 모든 태스크 완료 + QA PASS 후 `SendMessage({to: "*", message: {type: "shutdown_request"}})` → `TeamDelete`

Lead (나) 역할:
- 태스크 설계 + `plan-eng-review` / `plan-ceo-review` / `plan-design-review` skill 호출
- QA FAIL 중 "데이터/환경 문제" triage
- 사용자 커뮤니케이션 + 최종 ship

**구현 / 리뷰 / QA 는 직접 하지 않는다** — teammate 에게 위임.

### Skill routing

요청이 아래 트리거와 매칭되면 **Skill 툴을 first action 으로** 호출 (직접 답변 금지):

#### 작업 플로우
- 제품 아이디어, 브레인스토밍 → **office-hours**
- 버그, 500 에러, "왜 이게 안 돼" → **investigate**
- 다단계 작업 plan 작성 → **superpowers:writing-plans**
- Plan 실행 (subagent 기반, 팀 필요 없음) → **superpowers:subagent-driven-development**
- "완료" 주장 전 증거 수집 → **superpowers:verification-before-completion**
- worktree 에서 isolated 작업 시작 → **superpowers:using-git-worktrees**

#### 리뷰 / 검증
- 코드 리뷰 / diff 체크 → **review** (gstack)
- kiditem 컨벤션 + 디자인 리뷰 → **kiditem-review**
- 독립 2nd opinion / codex challenge → **codex**
- 보안 감사 / PII / 권한 → **security-review** 또는 **cso**
- 성능 / 페이지 속도 → **benchmark**
- QA / 사이트 테스트 / 버그 찾기 → **qa**
- 비주얼 감사 / 디자인 폴리시 → **design-review**
- 코드 퀄리티 / 헬스 체크 → **health**

#### Plan 단계 리뷰
- 아키텍처 리뷰 → **plan-eng-review**
- scope 재고 / "더 야심차게" → **plan-ceo-review**
- UI/UX plan 구멍 → **plan-design-review**
- API/CLI/SDK DX plan → **plan-devex-review**
- 위 전부 auto 연쇄 → **autoplan**

#### 환경 / 동기화
- shared / prisma 변경 후 로컬 동기화 → **kiditem-sync**
- 디자인 시스템 / 브랜드 → **design-consultation**

#### Post-ship
- Ship / deploy / PR 생성 → **ship**
- Ship 후 배포 감시 → **canary**
- Ship 후 문서 업데이트 → **document-release**
- Weekly retro → **retro**

#### 기타
- 진행 저장 / 체크포인트 / 재개 → **checkpoint**
- 이전 패턴 recall → **learn**
