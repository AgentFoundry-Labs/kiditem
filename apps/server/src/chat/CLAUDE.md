# chat — CopilotKit Runtime + Claude CLI Adapter

6 파일. **CopilotKit 런타임 + 커스텀 Claude CLI adapter + SSE 토큰 스트리밍**. NestJS의 일반 컨트롤러 패턴과 다르므로 별도 도메인 문서.

## Directory

```
chat/
├── chat.module.ts
├── chat.controller.ts        # POST /api/chat (SSE)
├── chat.service.ts           # CopilotKit runtime init + Observable stream
├── claude-cli-adapter.ts     # CopilotServiceAdapter impl, spawn Claude CLI
├── dto/
│   ├── chat.dto.ts           # ChatRequestDto
│   └── index.ts
```

## CopilotKit Setup

- 패키지: `@copilotkit/runtime@^1.54.1` (apps/server/package.json:15)
- 두 마운트:
  - `POST /api/chat` — NestJS controller (간단 endpoint)
  - `POST /api/chat/copilot/*` — CopilotKit Hono router (multi-turn agent orchestration)

### Express pre-registration (NestJS 우회)

`main.ts:24` — `expressApp.use('/api/chat/copilot', ...)` 가 NestFactory **이전에** 등록됨.

이유: CopilotKit 내부 Hono router 가 `/info`, `/...` 등 sub-route 를 가지는데, NestJS `@All('copilot')` exact-match 가 가로채면 sub-route 못 갂. URL 패치 (`req.url = req.originalUrl`, line 31) 로 Express prefix strip 보정.

### ClaudeCliAdapter 등록 (chat.service.ts:34)

```typescript
const serviceAdapter = new ClaudeCliAdapter();
const runtime = new CopilotRuntime();
this.copilotHandler = copilotRuntimeNestEndpoint({
  runtime,
  serviceAdapter,
  endpoint: '/api/chat/copilot',
});
```

## ClaudeCliAdapter (claude-cli-adapter.ts)

### Spawn Pattern

```typescript
spawn('claude', args, {
  cwd: process.cwd(),
  env: { ...process.env, AGENT_DATABASE_URL: '...' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

- 요청당 새 child process. 풀링/재사용 없음.
- 단일 시도 — async wait 안 함 (synchronous spawn).

### Args (CLI 호출 인자)

```typescript
[
  '-p', fullPrompt,                                  // system + user 합친 prompt
  '--output-format', 'stream-json',                  // 라인당 JSON
  '--print',                                         // 토큰 스트림 print
  '--permission-mode', 'bypassPermissions',
  '--allowedTools', 'Bash(psql:*) Read Grep',        // Read-only DB only
  ...(sessionId ? ['--session-id', sessionId] : []), // multi-turn 옵션
]
```

### ENV — AGENT_DATABASE_URL 우선순위

```typescript
process.env.CHATBOT_DATABASE_URL ||
process.env.AGENT_DATABASE_URL ||
process.env.DATABASE_URL ||
'';
```

Read-only PostgreSQL (Bash(psql:*) tool 로만 접근). 데이터 prompt 주입 없음.

### Stream 파싱

`child.stdout.on('data')` — 청크 → 라인 split → JSON.parse 시도 → `content_block_delta` 매칭 시 `eventStream$.sendTextMessageContent()` 호출.

**Buffer 관리**: 미완성 라인 `buffer` 에 보관, 다음 청크에서 이어붙임. `child.on('close')` 에서 잔여 처리.

**Silent failure**: malformed JSON 라인은 skip (stream 손상 회복).

### 프로세스 라이프사이클

- 타임아웃: **120s** (SIGTERM) → **10s grace** (SIGKILL)
- `child.on('close')` / `child.on('error')`: timeoutRef clear, killed flag set, eventStream$ complete
- Subscriber unsubscribe (client disconnect) → return cleanup → `child.kill('SIGTERM')` → 좀비 방지

## SSE Flow

`chat.controller.ts`:
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
```

Observable → `MessageEvent` per token → `res.write('data: ' + JSON + '\n\n')`.

이벤트 타입: `text` (토큰), `result` (메타), `error`, `done`.

## Dual Implementations

| 경로 | 핸들러 | 용도 |
|---|---|---|
| `/api/chat` | `chat.service.stream()` (RxJS Observable) | Quick prototype endpoint |
| `/api/chat/copilot/*` | `claude-cli-adapter.process()` (CopilotServiceAdapter) | 풀 CopilotKit 런타임 (multi-turn) |

둘 다 **동일한 Claude CLI process spawn** — args/env 같음. 차이는 어떻게 결과 stream 을 노출하느냐 (RxJS vs CopilotKit `eventSource.stream()`).

## 핵심 패턴

1. **Process per request** — 풀링 없음, 짧은 lifetime (2-120s)
2. **Token buffering** — newline-bounded, partial JSON 누적
3. **Silent JSON failure** — corruption 회복 가능
4. **SIGTERM → SIGKILL grace** — 좀비 방지
5. **Tool allowlist for safety** — `--permission-mode` + `--allowedTools` 로 read-only 강제
6. **No data injection in prompts** — agent 가 동적으로 DB 조회 (agent-registry 도메인과 동일 원칙)

## 외부 의존

- **Claude CLI** (`claude` 명령어가 PATH에 있어야 함)
- **PostgreSQL** (read-only, AGENT_DATABASE_URL)
- **agent-config/prompts/agents/chat.md** (런타임 prompt 로드)
- **CopilotKit runtime** (`@copilotkit/runtime`)

**agent-registry/ 와 독립** — 둘 다 same DB read pattern 쓰지만 별개 도메인. chat 은 self-contained.

## 금지 (Hard bans)

- ❌ Tool allowlist 변경 (현재 `Bash(psql:*) Read Grep`) — write 권한 부여 시 보안 audit 필요
- ❌ Data 변수를 prompt 에 주입 (agent 가 동적으로 DB 조회 원칙)
- ❌ Timeout 로직 제거 (resource exhaustion 방지)
- ❌ Child process 공유 (request isolation 깨짐 → multi-tenant 위험)
- ❌ shell interpolation 사용 (spawn args 명시적 array 만)
- ❌ stderr 로깅 추가 (silent failure 의도)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Args 변경 (model, tools 등) | `claude-cli-adapter.ts:args` + tests + 보안 영향 검토 |
| ENV 우선순위 변경 | `claude-cli-adapter.ts` + 운영 환경 변수 문서 |
| Timeout/grace 값 | `claude-cli-adapter.ts` (TIMEOUT_MS, GRACE_MS 상수) — load test 후 변경 |
| Prompt 변경 | `agent-config/prompts/agents/chat.md` (DB 안에 안 둠) |
| 새 endpoint 추가 | `chat.controller.ts` + `main.ts` (Express pre-registration 패턴 따라가기) |
| CopilotKit 버전 업그레이드 | `chat.service.ts` (runtime API 변경 가능) + `main.ts` (Hono router 호환성) |
| Multi-tenant credential | `claude-cli-adapter.ts:env` injection — 큰 변경, ADR 필요 |
