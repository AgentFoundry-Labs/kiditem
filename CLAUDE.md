# KidItem

E-commerce operations automation for kids' products. Sourcing → AI processing → Listing → Operations.

## Essentials

- **npm workspaces monorepo** — PostgreSQL + Prisma + NestJS + Next.js + Python agents.
- **One domain per session** — no cross-domain modifications.
- **Verify before completing** — backend: `npm run dev:server` boots. Frontend: build succeeds. Schema: `db:push` + `prisma generate` + shared build.
- **No follow-up issues** — apply changes to ALL files in scope. Never defer to TODO.
- **Reference first** — research major OSS projects before introducing new patterns.
- **CLAUDE.md 먼저 읽기** — 코드 수정 전 해당 도메인의 CLAUDE.md를 먼저 읽을 것. subagent 위임 시에도 명시.

## Structure

```
apps/web/            — Next.js 16 frontend (see apps/web/CLAUDE.md)
apps/server/         — NestJS 11 backend API (see apps/server/CLAUDE.md)
agents/              — Python 3.11+ background workers (see agents/CLAUDE.md)
packages/shared/     — @kiditem/shared (Zod schemas + TypeScript types + error codes)
packages/templates/  — React detail page templates (see packages/templates/CLAUDE.md)
prisma/              — DB schema source of truth (see prisma/CLAUDE.md)
extensions/          — Chrome extensions (product-scraper: 1688/Alibaba, coupang-ads-scraper: 쿠팡 광고센터+Wing)
```

## Cross-Domain Rules

- **No direct DB access from frontend** — must go through NestJS API.
- **Workflows must never call LLMs directly** — delegate to agents via `agent_task.create`.
- **No silent model fallback** — `model = model or default` pattern prohibited.
- **No native PG enums** — `String` + app-level validation. Production cast error experience.
- **아키텍처 결정 기록** — 경계·정책·폐기 선언·cross-domain 규칙 전복은 `.claude/docs/decisions/NNNN-*.md` 에 ADR 작성. 트리거·운영 규칙은 [decisions/README](.claude/docs/decisions/README.md). 기존 ADR 불변, 뒤집을 땐 새 ADR + `superseded-by`.
- **PR 생성 시** — `.github/PULL_REQUEST_TEMPLATE.md` 템플릿 내용을 body에 포함하고 체크리스트를 작성할 것. DB 변경/backfill/init.sql.gz 갱신 여부를 반드시 명시.
- **PR 생성 전 체크** — `gh pr create` 시 pre-hook이 자동 실행. 코드 컨벤션 + 문서 업데이트 체크리스트 확인 후 PR 생성.

## Reference (read when relevant)

- [Design System](DESIGN.md) — 색상, 타이포, 스페이싱, 컴포넌트 패턴 (Tailwind + Lucide)
- [ERD](.claude/docs/erd.md) — 사람이 정리한 도메인별 관계도 (9도메인). 자동 추출 보강: [graphify-out/erd/GRAPH_REPORT.md](graphify-out/erd/GRAPH_REPORT.md) — god nodes / 파이프라인 hyperedges / drift 감지. 재생성: `./scripts/graphify-erd.sh` 후 Claude Code에서 `/graphify graphify-out/.erd-corpus --wiki`.
- **코드 지식그래프**: `graphify-out/{도메인}/` — CLAUDE.md 규칙+패턴이 해당 코드와 함께 클러스터됨. 현재: [server/agent-registry](graphify-out/server/agent-registry/GRAPH_REPORT.md). 새 도메인 빌드: `cd <domain-path> && /graphify . --wiki` 후 `graphify-out/{도메인}/`로 이동. 쿼리 예: `/graphify query "Observer 패턴 관련 파일과 규칙은?"`
- [Architecture](.claude/docs/architecture.md) — data flow, agent runtimes, @kiditem/shared, workflow vs agent boundary
- [Commands & Environment](.claude/docs/commands.md) — quick start, dev commands, ports, env vars, tests
- [Workflow & Process](.claude/docs/workflow.md) — autonomy spectrum, verification, collaboration, branches, commits, PRs
- [Lessons Learned](.claude/docs/lessons.md) — team-shared patterns from past incidents
- [Architecture Decisions (ADR)](.claude/docs/decisions/README.md) — 아키텍처 결정 이력(불변). 트리거·규칙·도메인별 인덱스
- [Server Rules](apps/server/CLAUDE.md) — 도메인 모듈 패턴, API 응답, DTO 규칙
- [Advertising Rules](apps/server/src/advertising/CLAUDE.md) — 광고 도메인 엔드포인트, 데이터 소스
- [Agent Registry Rules](apps/server/src/agent-registry/CLAUDE.md) — 에이전트 런타임, 프롬프트, 안전장치
- [Workflow Rules](apps/server/src/workflows/CLAUDE.md) — 실행 흐름, executor, 카탈로그
- [Frontend Rules](apps/web/CLAUDE.md) — API 호출, 데이터 페칭, 스타일링
- [Shared Package Rules](packages/shared/CLAUDE.md) — Zod 스키마, satisfies 패턴
- [Schema Rules](prisma/CLAUDE.md) — DB 네이밍, 타입, 마이그레이션
- [Agent Rules](agents/CLAUDE.md) — Python 에이전트 런타임, DB 접근
- [Templates Rules](packages/templates/CLAUDE.md) — React 상세 페이지 템플릿

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
