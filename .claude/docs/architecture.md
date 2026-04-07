# Architecture

```
[Frontend] Next.js — UI, user input
     ↓ apiClient (TanStack Query)
[Backend] NestJS — ValidationPipe + DTO → business logic → GlobalExceptionFilter
     ↓ Prisma         ↓ spawn('claude', ...)       ↓ agent_tasks INSERT
[DB] PostgreSQL    [Claude CLI Agents]          [Python Agents]
 (RLS 적용)         judgment/analysis             generation/processing
```

## AI 챗봇

내장 기능. CopilotKit 사이드바 + ClaudeCliAdapter (Claude CLI spawn).
- 프론트: `CopilotKit` Provider + `CopilotSidebar` (AppLayout)
- 백엔드: `src/chat/` 모듈 → `@All('copilot')` 엔드포인트
- 프롬프트: `agent-config/prompts/agents/chat.md` (DB 스키마 + 쿼리 가이드)
- DB 접근: `CHATBOT_DATABASE_URL` (chatbot_readonly 유저, RLS company_id 필터)
- 챗봇은 마켓플레이스에 등록하지 않음 (내장, 운영자가 버전 관리)

## Agent Runtimes

Two agent runtimes:
- **Claude CLI agents**: NestJS spawns `claude -p`. Natural language judgment tasks. → `apps/server/src/agent-registry/`
- **Python agents**: FastAPI HTTP server. Image APIs, scraping. → `agents/`

## Agent vs 챗봇 역할

- **챗봇**: 사용자 대화형 질의응답 (즉시, DB 직접 조회). 내장 기능.
- **에이전트**: 자동 분석/모니터링 (정기 실행, 결과 저장). 마켓플레이스에서 설치.
- 챗봇이 필요 시 에이전트를 트리거할 수 있음.

## Users 테이블 통합

사람과 AI를 `users` 테이블에 통합:
- `type = 'human'`: 사람 직원
- `type = 'agent'`: AI 에이전트 (agent_definition_id 연결)
- `type = 'system'`: 챗봇 (company_id = null, 전체 공유)

## RLS (Row Level Security)

`chatbot_readonly` DB 유저에 company_id 기반 RLS 적용 (11개 테이블).
- NestJS 서버 (`kiditem` 유저): 테이블 오너 → RLS 미적용 (코드에서 필터)
- 챗봇/에이전트 (`chatbot_readonly`): RLS 적용 → 세션변수 `app.company_id`로 자동 필터

## @kiditem/shared

Shared Zod schemas between frontend and backend. `z.infer<>` for type inference.

- Subpath exports: `@kiditem/shared`, `@kiditem/shared/schemas`, `@kiditem/shared/errors`
- Dual format: ESM (frontend) + CJS (backend)
- `satisfies` pattern in services to detect Prisma-Shared type drift (e.g., `satisfies ProductListItem`)
- Adding types: define Zod schema in `packages/shared/src/schemas/` → export in `index.ts` → `npm run build`

## Workflow vs Agent Boundary

| | Workflow | Agent |
|---|---|---|
| Role | Data pipeline (fetch→transform→filter→notify) | AI judgment/analysis (rule interpretation, strategy) |
| Execution | Fixed DAG, deterministic | Natural language prompt, non-deterministic |
| AI usage | Prohibited — delegate via `agent_task.create` node | Core role |

**Principle: Workflows must never call LLMs directly.** Delegate to agents via `agent_task.create` when AI judgment is needed.
