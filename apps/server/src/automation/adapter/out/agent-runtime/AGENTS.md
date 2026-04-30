# agent-runtime — Agent OS execution adapters

이 폴더는 Automation / Agent OS owner domain 의 outgoing runtime adapter
surface 다. Phase 3C-6 이후 Claude CLI / Python HTTP 실행 adapter 와 fallback
chain 은 여기서 관리한다.

## Layout

```
automation/adapter/out/agent-runtime/
├── agent-schedule-control.adapter.ts  # rules schedule port implementation
├── types.ts                           # ExecutionContext + AdapterModule
├── registry.ts                        # adapter type registry
├── fallback-chain.ts                  # observable adapter fallback chain
├── claude-local/execute.ts            # Claude CLI stream-json adapter
└── python-http/execute.ts             # Python HTTP compatibility adapter
```

## Hard Bans

- No silent model fallback. `claude-local` must fail if
  `AgentDefinition.adapterConfig.model` is missing.
- Adapter fallback is runtime fallback only. It may try another adapter from
  `AgentDefinition.fallbackChain`, but it must emit fallback events and must
  not change the selected model silently.
- `ExecutionContext` is immutable. Retry paths create a new frozen context.
- Runtime adapters must not own AgentDefinition/HeartbeatRun persistence.
  Persistence belongs to application services and heartbeat runtime.

## Together

| Change | Also check |
|---|---|
| `types.ts` | `agent-registry/heartbeat/heartbeat.service.ts` context assembly |
| `registry.ts` | every adapter directory and `AgentDefinition.fallbackChain` seed data |
| `fallback-chain.ts` | heartbeat fallback tests + agent fallback SSE events |
| `claude-local/execute.ts` | no silent model fallback, max token escalation, stream-json parsing |
