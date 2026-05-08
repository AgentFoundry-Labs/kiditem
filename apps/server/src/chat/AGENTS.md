# chat — CopilotKit Runtime + Claude CLI Adapter

**CopilotKit 런타임 + 커스텀 Claude CLI adapter + SSE 토큰 스트리밍**. NestJS의 일반 컨트롤러 패턴과 다르므로 별도 도메인 문서.

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

### Browser-facing path = same-origin rewrite

브라우저는 `NEXT_PUBLIC_API_URL` / `API_BASE` 로 chat runtime 을 직접 호출하지
않는다. `apps/web/next.config.mjs` rewrites 가 `/api/chat/copilot` 및
`/api/chat/copilot/:path*` 를 backend base 로 보낸다. 그래서 같은 origin 의
Supabase SSR auth-token cookie 가 그대로 따라오고 cross-origin CORS preflight
는 발생하지 않는다. 이 규약 때문에 chat 전용 CORS helper 는 두지 않는다 —
`app.enableCors` 의 일반 화이트리스트가 server→server 호출만 커버하면 된다.

### Express pre-registration (NestJS 우회)

`main.ts:24` — `expressApp.use('/api/chat/copilot', ...)` 가 NestFactory **이전에** 등록됨.

이유: CopilotKit 내부 Hono router 가 `/info`, `/...` 등 sub-route 를 가지는데, NestJS `@All('copilot')` exact-match 가 가로채면 sub-route 못 갂. URL 패치 (`req.url = req.originalUrl`, line 31) 로 Express prefix strip 보정.

Raw chat handler 는 Nest middleware 앞에 등록되므로 cookie session 을 읽으려면
**`expressApp.use(cookieParser())` 가 raw route 등록 전에 호출돼 있어야 한다**.
이 줄을 옮기거나 제거하지 말 것 — `SupabaseAuthMiddleware` 가 cookie 에서
access token 을 끄집어내는 단일 진입점이다.

또한 raw route 앞에 **`expressApp.use('/api/chat/copilot', express.json(...))`** 가
반드시 등록돼 있어야 한다. CopilotKit v2 single-route helper 는 내부적으로
`request.clone().json()` 을 호출하는데, IncomingMessage 를 ReadableStream 으로
래핑한 Web Request 에서 이 호출이 `Invalid JSON payload (400)` 로 실패한다 (Node
fetch 의 streaming clone 한계). bodyParser 가 먼저 돌면 `req.body` 가 채워지고
CopilotKit 의 `synthesizeBodyFromParsedBody` 가 buffered body 로 새 Web Request 를
재구성해 정상 파싱된다. 이 줄을 없애면 chat runtime 의 `info` 호출조차 400 으로
떨어진다.

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
  env: buildClaudeCliEnv(),
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
  '--allowedTools', 'Read Grep',
  ...(sessionId ? ['--session-id', sessionId] : []), // multi-turn 옵션
]
```

### ENV — child process whitelist

`buildClaudeCliEnv()` 는 Claude 실행에 필요한 최소 환경만 전달한다. `DATABASE_URL`,
`CHATBOT_DATABASE_URL`, `AGENT_DATABASE_URL` 같은 DB credential 은 child process 에
전달하지 않는다. Chat/agent 데이터 접근은 backend application service 가 제공한
organization-scoped context 로만 한다.

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
5. **Tool allowlist for safety** — `--permission-mode` + `--allowedTools` 로 파일 읽기/검색만 허용
6. **No direct DB access** — agent 에 DB URL 을 전달하지 않음

## 외부 의존

- **Claude CLI** (`claude` 명령어가 PATH에 있어야 함)
- **agent-config/prompts/agents/chat.md** (런타임 prompt 로드)
- **CopilotKit runtime** (`@copilotkit/runtime`)

**Agent OS 와 독립** — 둘 다 DB 직접 조회를 금지하고 backend-provided context 를 사용한다. chat 은 self-contained.

## 금지 (Hard bans)

- ❌ Tool allowlist 에 `Bash(psql:*)`, `Bash(*)`, DB client 실행 권한 추가
- ❌ DB credential 을 child process env 에 전달
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
| Multi-tenant credential | `claude-cli-adapter.ts:env` injection — 큰 변경, scoped plan/instruction update 필요 |
