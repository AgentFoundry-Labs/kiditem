# chat — CopilotKit Runtime + Claude CLI Adapter

Chat owns the CopilotKit runtime bridge, Claude CLI adapter, and token-streaming
SSE endpoints. It is self-contained and independent from Agent OS.

## Architecture Mode

Mode: Platform Runtime Adapter / Transitional Flat.

Chat stays flat because the surface is small and self-contained. The Claude CLI
adapter is the IO boundary. Any new tools, persistence, account mutation,
background execution, or Agent OS integration requires a port/adapter split and
security review.

## Layout

```text
chat/
  chat.module.ts
  chat.controller.ts        POST /api/chat
  chat.service.ts           CopilotKit runtime init + Observable stream
  claude-cli-adapter.ts     CopilotServiceAdapter implementation
  dto/chat.dto.ts
```

## Routes

| Path | Handler | Use |
|---|---|---|
| `/api/chat` | Nest controller/RxJS stream | simple SSE endpoint |
| `/api/chat/copilot/*` | pre-registered CopilotKit router | browser CopilotKit runtime |

Browser CopilotKit calls same-origin `/api/chat/copilot`; the web app rewrite
forwards it to Nest. Do not route chat through `NEXT_PUBLIC_API_URL`.

## Express Pre-Registration

`main.ts` registers `/api/chat/copilot` on the Express app before NestFactory so
CopilotKit subroutes are not swallowed by Nest exact route matching.

Keep these before the raw route:

- `cookieParser()` so Supabase SSR auth-token cookies are visible.
- `express.json(...)` so CopilotKit's single-route helper can synthesize a Web
  Request from the parsed body instead of failing with invalid JSON.

## Claude CLI Adapter

- One child process per request; no pooling or sharing.
- Use `spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] })` with an
  explicit args array.
- Allowed tools are read/search only.
- Child env is allowlisted; never pass `DATABASE_URL`, `CHATBOT_DATABASE_URL`,
  `AGENT_DATABASE_URL`, or other DB credentials.
- Timeout is 120s, then SIGTERM, then SIGKILL after a 10s grace period.
- Client disconnect kills the child process.
- stdout is newline-delimited JSON. Partial lines are buffered; malformed lines
  are skipped to recover from stream corruption.

## SSE Contract

The simple controller writes `text/event-stream` with events:
`text`, `result`, `error`, and `done`.

Both route families use the same Claude CLI spawn model; they differ only in
stream exposure (RxJS vs CopilotKit event stream).

## Hard Bans

- Adding Bash, psql, DB client, or broad shell tools to the allowlist.
- Passing DB credentials to the child process.
- Removing timeout/grace cleanup.
- Sharing child processes across requests.
- Shell interpolation.
- Adding stderr logging that may leak prompt/context data.

## Change Map

| Change | Also update |
|---|---|
| CLI args/model/tools | adapter tests + security review |
| env allowlist | operational env docs |
| timeout/grace | adapter constants + load-test evidence |
| prompt | `agent-config/prompts/agents/chat.md` |
| CopilotKit upgrade | `chat.service.ts` + `main.ts` route compatibility |
| new chat endpoint | controller + `main.ts` pre-registration pattern |
