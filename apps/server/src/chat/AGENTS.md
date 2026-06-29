Consult this document first instead of relying on memorized knowledge.

# chat — CopilotKit Runtime + Claude CLI Adapter

`src/chat/` owns the CopilotKit runtime bridge, Claude CLI adapter, and
token-streaming SSE endpoints. It is self-contained and independent from Agent
OS.

## Folder Map

```text
chat/
├── chat.module.ts
├── chat.controller.ts        # POST /api/chat simple SSE endpoint
├── chat.service.ts           # CopilotKit runtime init + Observable stream
├── claude-cli-adapter.ts     # CopilotServiceAdapter implementation
└── dto/chat.dto.ts
```

## Owned Surfaces

- `POST /api/chat`
- `/api/chat/copilot/*`, pre-registered on the Express app before Nest route
  matching

Browser CopilotKit calls same-origin `/api/chat/copilot`; the web rewrite
forwards it to Nest. Do not route chat through `NEXT_PUBLIC_API_URL`.

## Runtime Flow

```text
HTTP request
  -> chat service / CopilotKit runtime
  -> Claude CLI child process
  -> newline-delimited JSON stdout
  -> SSE events: text, result, error, done
```

One child process is created per request. Client disconnect kills the child.

## Boundary Rules

- Allowed Claude tools are read/search only.
- Child env is allowlisted; never pass DB credentials or other secrets.
- Use explicit `spawn('claude', args, { stdio: [...] })`; no shell
  interpolation.
- Timeout is 120s, followed by SIGTERM and then SIGKILL after a 10s grace
  period.
- stdout partial lines are buffered; malformed lines are skipped.
- Do not add Bash, psql, DB clients, broad shell tools, or shared child-process
  pooling.
- Do not add stderr logging that may leak prompt/context data.

## Transitional Exceptions

- Chat stays flat because the surface is small. New tools, persistence, account
  mutation, background execution, or Agent OS integration requires a
  port/adapter split and security review.
