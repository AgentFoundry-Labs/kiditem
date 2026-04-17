# Architecture

```
[Frontend] Next.js — UI, user input
     ↓ apiClient (TanStack Query)
[Backend] NestJS — ValidationPipe + DTO → business logic → GlobalExceptionFilter
     ↓ Prisma         ↓ spawn('claude', ...)       ↓ agent_tasks INSERT
[DB] PostgreSQL    [Claude CLI Agents]          [Python Agents]
 (RLS 적용)         judgment/analysis             generation/processing
```

상세 규칙은 각 도메인 CLAUDE.md 에:
- Frontend 데이터 페칭 / styling: [`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md)
- Backend API 패턴 + DTO + 에러: [`apps/server/CLAUDE.md`](../../apps/server/CLAUDE.md)
- 챗봇 (CopilotKit + ClaudeCliAdapter): [`apps/server/src/chat/CLAUDE.md`](../../apps/server/src/chat/CLAUDE.md)
- Agent OS (adapter/spawn/prompt): [`apps/server/src/agent-registry/CLAUDE.md`](../../apps/server/src/agent-registry/CLAUDE.md)
- Python agents: [`agents/CLAUDE.md`](../../../agents/CLAUDE.md)
- @kiditem/shared (Zod + satisfies): [`packages/shared/CLAUDE.md`](../../../packages/shared/CLAUDE.md)
- Schema 규칙: [`prisma/CLAUDE.md`](../../../prisma/CLAUDE.md)

## 범시스템 인프라 사실 (여기 아니면 기록할 곳 없음)

### Agent Runtimes — 2종

- **Claude CLI agents**: NestJS 가 `claude -p` 를 spawn. 자연어 판단/분석 태스크. 상세 → `agent-registry/CLAUDE.md`.
- **Python agents**: FastAPI HTTP 서버. 이미지 API, 스크래핑 등. 상세 → `agents/CLAUDE.md`.

### 챗봇 vs 에이전트 — 자율성 경계

- **챗봇**: 사용자 대화형 질의응답. 즉시 응답, DB 직접 조회. human-in-the-loop. 내장 기능 — 마켓플레이스 미등록.
- **에이전트**: 자동 분석/모니터링. 정기 실행, 결과 저장. 완전 자율. 마켓플레이스 설치형.
- 챗봇이 필요 시 에이전트 트리거 가능.

### Users 테이블 — 인간·AI·시스템 통합

`users` 테이블 하나에 `type` 필드로 구분: `human` (직원) / `agent` (AI, `agent_definition_id` 연결) / `system` (챗봇, `company_id = null`, 전체 공유).

### RLS (Row Level Security)

`chatbot_readonly` DB 유저에 `company_id` 기반 RLS 적용.
- NestJS 서버 (`kiditem` 유저): 테이블 오너 → RLS 미적용 (코드에서 filter).
- 챗봇/에이전트 (`chatbot_readonly`): RLS 적용 → 세션변수 `app.company_id` 로 자동 filter.
