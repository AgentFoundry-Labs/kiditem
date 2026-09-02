# Agent OS HQ Hermes Paperclip Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Agent OS table screen with a virtual-office HQ where the user talks to staff-like agents, while adopting Paperclip/Hermes-style session continuity, transcript telemetry, and cost reporting inside the existing KidItem Agent OS runtime.

**Architecture:** Keep KidItem Agent OS as the runtime authority: run requests still flow through `AGENT_RUNTIME_PORT`, Hermes only receives the curated `kiditem-agent-os` MCP toolset when MCP is enabled, and downstream business side effects remain owned by their domains. Backend work extends the existing Hermes runtime adapter to parse `session_id`/usage metadata, resume stored Hermes sessions through `AgentTaskSession.metadata.runtimeThreadId`, and project richer run events. Frontend work replaces `apps/web/src/app/(automation)/agents/page.tsx` with a route-local React Query HQ shell that composes existing Nest endpoints for instances, runs, requests, approvals, conversations, cost, authorization, and run events.

**Tech Stack:** NestJS 11, Prisma existing JSON metadata, Hermes CLI, KidItem Agent OS MCP, Next.js App Router, React 19, React Query 5, Tailwind CSS, lucide-react, Vitest, React Testing Library.

## Global Constraints

- Scope classification: Agent OS platform reconstruction across backend runtime and the automation Agent OS web route; this remains one business/platform domain.
- Benchmark the Hermes binding pattern from Paperclip; do not import Paperclip's company, issue, governance, or budget model into KidItem.
- Do not expose broad `curl`, raw API credentials, or unbounded tool execution to Hermes. KidItem MCP/capability allowlists stay authoritative.
- Frontend code uses NestJS APIs through `apiClient`; no Prisma, `pg`, Supabase DB client, direct DB client, or raw backend `fetch`.
- Frontend requests never send `organizationId`; backend session scope owns tenancy.
- Missing model selection is an explicit error; do not introduce `model || default` fallback behavior.
- Runtime execution goes through `AGENT_RUNTIME_PORT` and registered handlers; Agent OS does not update downstream business rows.
- No Prisma schema migration for this MVP. Persist Hermes resume state in existing `AgentTaskSession.metadata.runtimeThreadId`.
- No SSE or WebSocket surface in this plan. Use React Query polling through `refetchInterval`.
- UI uses route-local `components/`, `hooks/`, and `lib/` under `apps/web/src/app/(automation)/agents/`.
- UI uses semantic CSS variables, `cn()` from `@/lib/utils`, and lucide-react icons. Avoid nested cards; panels are direct work surfaces.
- Backend verification gates: narrow Vitest suites, `npm run build --workspace=apps/server`, and `npm run dev:server`.
- Frontend verification gates: narrow Vitest suites, `npm run build --workspace=apps/web`, and `npx vitest run`.

---

## File Structure

Backend runtime:

- Create `apps/server/src/agent-os/adapter/out/runtime/hermes-runtime-output.ts`
  - Owns parsing of Hermes stdout metadata: `session_id`, token usage, cost, and inspectable transcript events.
- Create `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts`
  - Unit tests for metadata stripping, usage extraction, and final-text preservation.
- Create `apps/server/src/agent-os/adapter/out/runtime/hermes-task-session.ts`
  - Owns safe read/write helpers for `AgentTaskSession.metadata.runtimeThreadId`.
- Create `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts`
  - Unit tests for session metadata extraction and repository patching.
- Modify `apps/server/src/agent-os/adapter/out/runtime/hermes-operator-runtime.adapter.ts`
  - Adds `resumeSessionId`, invokes `hermes chat --resume`, and returns parsed `sessionId`, usage, and transcript metadata.
- Modify `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`
  - Passes resume IDs into Hermes, persists returned session IDs, appends session/usage runtime events, and forwards token/cost data to `AgentRunExecutor`.
- Modify `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`
  - Applies the same resume/persist/usage behavior for leaf agents.
- Modify `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts`
  - Covers `--resume`, parsed usage, and session metadata.
- Modify `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`
  - Covers Operator resume/persist and cost propagation.
- Modify `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`
  - Covers Leaf resume/persist and cost propagation.

Frontend HQ route:

- Modify `apps/web/src/lib/query-keys.ts`
  - Adds stable Agent OS HQ query keys.
- Modify `apps/web/src/app/(automation)/agents/lib/agent-os-api.ts`
  - Adds route-local wrappers for conversations, messages, graph, approvals, cost events, and authorization events.
- Create `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`
  - Pure view-model builder for office nodes, activity feed, status rail, and selected-agent detail.
- Create `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`
  - Unit tests for status derivation, office placement, and activity ordering.
- Create `apps/web/src/app/(automation)/agents/hooks/useAgentOffice.ts`
  - React Query orchestration and command mutations for the HQ screen.
- Create `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.tsx`
  - Main work surface composition.
- Create `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.tsx`
  - Office floor / desk map.
- Create `apps/web/src/app/(automation)/agents/components/AgentOfficeNode.tsx`
  - Stable-size interactive staff node.
- Create `apps/web/src/app/(automation)/agents/components/AgentInspector.tsx`
  - Selected staff details and current work.
- Create `apps/web/src/app/(automation)/agents/components/AgentCommandBar.tsx`
  - Conversation command input.
- Create `apps/web/src/app/(automation)/agents/components/AgentActivityDrawer.tsx`
  - Recent runs/requests/approval/cost/auth feed.
- Create `apps/web/src/app/(automation)/agents/components/AgentStatusRail.tsx`
  - Compact operational totals.
- Create `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx`
  - Render/click tests for office nodes.
- Create `apps/web/src/app/(automation)/agents/components/AgentCommandBar.spec.tsx`
  - Form validation and submit tests.
- Modify `apps/web/src/app/(automation)/agents/page.tsx`
  - Replaces the current tables with the HQ shell.
- Create `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx`
  - Verifies loading, error, and composed HQ states.

## Task 1: Parse Hermes Output And Adapter Metadata

**Files:**
- Create: `apps/server/src/agent-os/adapter/out/runtime/hermes-runtime-output.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/hermes-operator-runtime.adapter.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts`

**Interfaces:**
- Consumes: raw Hermes stdout/stderr from `HermesProcessResult`.
- Produces:

```ts
export interface HermesRuntimeUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: bigint;
}

export interface HermesTranscriptEvent {
  type: 'assistant' | 'tool' | 'system' | 'thinking' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface HermesRuntimeOutput {
  finalText: string;
  sessionId: string | null;
  usage: HermesRuntimeUsage;
  transcriptEvents: HermesTranscriptEvent[];
}

export function parseHermesRuntimeOutput(input: {
  stdout: string;
  stderr?: string;
  durationMs?: number;
}): HermesRuntimeOutput;
```

- [ ] **Step 1: Write the parser tests**

Create `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseHermesRuntimeOutput } from '../hermes-runtime-output';

describe('parseHermesRuntimeOutput', () => {
  it('extracts session id and usage metadata without returning metadata as final text', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: [
        'session_id: hermes-session-123',
        '{"type":"token_usage","input_tokens":37,"output_tokens":11,"cached_input_tokens":5,"cost_micros":"900"}',
        '{"decisionType":"delegate","targetAgentType":"sourcing"}',
      ].join('\n'),
      durationMs: 42,
    });

    expect(parsed).toEqual({
      finalText: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
      sessionId: 'hermes-session-123',
      usage: {
        inputTokens: 37,
        outputTokens: 11,
        cachedInputTokens: 5,
        costMicros: 900n,
      },
      transcriptEvents: [
        {
          type: 'assistant',
          message: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
          data: { line: 3, durationMs: 42 },
        },
      ],
    });
  });

  it('parses compact usage lines emitted by Hermes wrappers', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: [
        '[usage] input_tokens=100 output_tokens=25 cached_input_tokens=10 cost_micros=1700',
        'Operator finished.',
      ].join('\n'),
    });

    expect(parsed.finalText).toBe('Operator finished.');
    expect(parsed.usage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cachedInputTokens: 10,
      costMicros: 1700n,
    });
  });

  it('keeps unknown JSON as final text because Operator strict JSON may be the answer', () => {
    const parsed = parseHermesRuntimeOutput({
      stdout: '{"decisionType":"ask_user","message":"승인할까요?"}',
    });

    expect(parsed.sessionId).toBeNull();
    expect(parsed.usage).toEqual({});
    expect(parsed.finalText).toBe('{"decisionType":"ask_user","message":"승인할까요?"}');
  });
});
```

- [ ] **Step 2: Run parser tests and verify they fail**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts
```

Expected: FAIL because `../hermes-runtime-output` does not exist.

- [ ] **Step 3: Implement the Hermes output parser**

Create `apps/server/src/agent-os/adapter/out/runtime/hermes-runtime-output.ts`:

```ts
export interface HermesRuntimeUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: bigint;
}

export interface HermesTranscriptEvent {
  type: 'assistant' | 'tool' | 'system' | 'thinking' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface HermesRuntimeOutput {
  finalText: string;
  sessionId: string | null;
  usage: HermesRuntimeUsage;
  transcriptEvents: HermesTranscriptEvent[];
}

const SESSION_ID_PATTERNS = [
  /^session_id:\s*(\S+)/i,
  /^session:\s*(\S+)/i,
  /^hermes_session_id:\s*(\S+)/i,
] as const;

const SECURITY_SCANNER_PATTERN = /^⚠\s+tirith security scanner enabled\b/i;

function positiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function bigintMicros(value: unknown): bigint | undefined {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return undefined;
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  if (!line.startsWith('{') || !line.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mergeUsage(target: HermesRuntimeUsage, source: Record<string, unknown>): boolean {
  const inputTokens = positiveInteger(source.input_tokens ?? source.inputTokens);
  const outputTokens = positiveInteger(source.output_tokens ?? source.outputTokens);
  const cachedInputTokens = positiveInteger(
    source.cached_input_tokens ?? source.cachedInputTokens,
  );
  const costMicros = bigintMicros(source.cost_micros ?? source.costMicros);
  const hasUsage =
    inputTokens !== undefined ||
    outputTokens !== undefined ||
    cachedInputTokens !== undefined ||
    costMicros !== undefined;

  if (inputTokens !== undefined) target.inputTokens = inputTokens;
  if (outputTokens !== undefined) target.outputTokens = outputTokens;
  if (cachedInputTokens !== undefined) target.cachedInputTokens = cachedInputTokens;
  if (costMicros !== undefined) target.costMicros = costMicros;
  return hasUsage;
}

function parseUsageLine(line: string): Record<string, unknown> | null {
  if (!/^\[usage\]\s+/i.test(line)) return null;
  const usage: Record<string, unknown> = {};
  for (const part of line.replace(/^\[usage\]\s+/i, '').split(/\s+/)) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    usage[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return usage;
}

function metadataSessionId(line: string): string | null {
  for (const pattern of SESSION_ID_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function transcriptType(value: unknown): HermesTranscriptEvent['type'] | null {
  if (
    value === 'assistant' ||
    value === 'tool' ||
    value === 'system' ||
    value === 'thinking' ||
    value === 'error'
  ) {
    return value;
  }
  return null;
}

export function parseHermesRuntimeOutput(input: {
  stdout: string;
  stderr?: string;
  durationMs?: number;
}): HermesRuntimeOutput {
  let sessionId: string | null = null;
  const usage: HermesRuntimeUsage = {};
  const finalLines: string[] = [];
  const transcriptEvents: HermesTranscriptEvent[] = [];

  input.stdout.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (SECURITY_SCANNER_PATTERN.test(trimmed)) return;

    const lineSessionId = metadataSessionId(trimmed);
    if (lineSessionId) {
      sessionId = lineSessionId;
      return;
    }

    const usageLine = parseUsageLine(trimmed);
    if (usageLine && mergeUsage(usage, usageLine)) return;

    const jsonObject = parseJsonObject(trimmed);
    if (jsonObject) {
      if (typeof jsonObject.session_id === 'string' && jsonObject.session_id.trim()) {
        sessionId = jsonObject.session_id.trim();
      }
      const jsonType = typeof jsonObject.type === 'string' ? jsonObject.type : null;
      const isUsageMetadata =
        jsonType === 'token_usage' ||
        jsonType === 'usage' ||
        jsonType === 'cost';
      if (isUsageMetadata && mergeUsage(usage, jsonObject)) return;

      const eventType = transcriptType(jsonObject.type);
      const message =
        typeof jsonObject.message === 'string'
          ? jsonObject.message
          : typeof jsonObject.content === 'string'
            ? jsonObject.content
            : null;
      if (eventType && message) {
        transcriptEvents.push({
          type: eventType,
          message,
          data: { ...jsonObject, line: index + 1 },
        });
        if (eventType !== 'assistant') return;
        finalLines.push(message);
        return;
      }
    }

    finalLines.push(line);
    transcriptEvents.push({
      type: 'assistant',
      message: line,
      data: {
        line: index + 1,
        ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      },
    });
  });

  return {
    finalText: finalLines.join('\n').trim(),
    sessionId,
    usage,
    transcriptEvents,
  };
}
```

- [ ] **Step 4: Run parser tests and verify they pass**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing adapter tests for parsed metadata and `--resume`**

Append to `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts` inside `describe('HermesOperatorRuntimeAdapter', () => { ... })`:

```ts
  it('returns parsed session id, token usage, and cost metadata', async () => {
    const runner = makeRunner(
      successfulResult(
        [
          'session_id: hermes-session-999',
          '{"type":"token_usage","input_tokens":41,"output_tokens":9,"cached_input_tokens":3,"cost_micros":"1200"}',
          '{"decisionType":"delegate","targetAgentType":"sourcing"}',
        ].join('\n'),
      ),
    );
    const adapter = makeAdapter(runner);

    const result = await adapter.decide(baseInput);

    expect(result).toEqual({
      provider: 'hermes',
      rawOutput: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
      stderr: 'diagnostic output',
      durationMs: 42,
      sessionId: 'hermes-session-999',
      inputTokens: 41,
      outputTokens: 9,
      cachedInputTokens: 3,
      costMicros: 1200n,
      transcriptEvents: [
        {
          type: 'assistant',
          message: '{"decisionType":"delegate","targetAgentType":"sourcing"}',
          data: { line: 3, durationMs: 42 },
        },
      ],
    });
  });

  it('passes --resume when a Hermes session id is available', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter(runner);

    await adapter.decide({
      ...baseInput,
      resumeSessionId: 'hermes-session-existing',
    });

    expect(runner.calls[0]?.args).toEqual([
      'chat',
      '-q',
      'Return strict JSON only.',
      '--model',
      'anthropic/claude-sonnet-4',
      '--toolsets',
      'skills',
      '-Q',
      '--ignore-rules',
      '--resume',
      'hermes-session-existing',
      '--provider',
      'openai-codex',
    ]);
  });
```

- [ ] **Step 6: Run adapter tests and verify they fail**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts
```

Expected: FAIL because `resumeSessionId`, parsed usage fields, and `transcriptEvents` are not returned yet.

- [ ] **Step 7: Update the adapter implementation**

Modify `apps/server/src/agent-os/adapter/out/runtime/hermes-operator-runtime.adapter.ts`:

```ts
import {
  parseHermesRuntimeOutput,
  type HermesTranscriptEvent,
} from './hermes-runtime-output';
```

Extend `HermesOperatorRuntimeInput`:

```ts
  resumeSessionId?: string | null;
```

Extend `HermesOperatorRuntimeResult`:

```ts
  sessionId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costMicros?: bigint;
  transcriptEvents?: HermesTranscriptEvent[];
```

Inside `decide`, after provider is resolved and before `runner.run`, build args like this:

```ts
      const resumeSessionId = stringField(input.resumeSessionId);
      const args = [
        'chat',
        '-q',
        input.prompt,
        '--model',
        model,
        '--toolsets',
        toolsets.join(','),
        '-Q',
        '--ignore-rules',
      ];
      if (resumeSessionId) {
        args.push('--resume', resumeSessionId);
      }
      if (provider) {
        args.push('--provider', provider);
      }
```

Replace the stdout normalization block after the subprocess result with:

```ts
    const stderr = capOutput(result.stderr);
    const parsed = parseHermesRuntimeOutput({
      stdout: capOutput(result.stdout),
      stderr,
      durationMs: result.durationMs,
    });
    const stdout = parsed.finalText;
```

Replace the returned object with:

```ts
    return {
      provider: 'hermes',
      rawOutput: stdout,
      stderr,
      durationMs: result.durationMs,
      sessionId: parsed.sessionId,
      inputTokens: parsed.usage.inputTokens,
      outputTokens: parsed.usage.outputTokens,
      cachedInputTokens: parsed.usage.cachedInputTokens,
      costMicros: parsed.usage.costMicros,
      transcriptEvents: parsed.transcriptEvents,
    };
```

Remove `normalizeHermesStdout` and `HERMES_STDOUT_METADATA_PATTERNS` when TypeScript reports them unused.

- [ ] **Step 8: Run adapter tests and verify they pass**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
rtk git add apps/server/src/agent-os/adapter/out/runtime/hermes-runtime-output.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts apps/server/src/agent-os/adapter/out/runtime/hermes-operator-runtime.adapter.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts
rtk git commit -m "feat: parse hermes runtime metadata"
```

Expected: commit succeeds.

## Task 2: Resume And Persist Hermes Task Sessions

**Files:**
- Create: `apps/server/src/agent-os/adapter/out/runtime/hermes-task-session.ts`
- Create: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`

**Interfaces:**
- Consumes: `AgentOsRepositoryPort.getTaskSession`, `AgentOsRepositoryPort.updateTaskSessionMetadata`, and `HermesOperatorRuntimeResult.sessionId`.
- Produces:

```ts
export function readRuntimeThreadId(metadata: Record<string, unknown>): string | null;
export async function loadHermesResumeSession(input: {
  repository: Pick<AgentOsRepositoryPort, 'getTaskSession'>;
  organizationId: string;
  taskSessionId: string;
}): Promise<string | null>;
export async function persistHermesRuntimeThread(input: {
  repository: Pick<AgentOsRepositoryPort, 'updateTaskSessionMetadata'>;
  organizationId: string;
  taskSessionId: string;
  sessionId: string | null | undefined;
}): Promise<void>;
```

- [ ] **Step 1: Write task-session helper tests**

Create `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  loadHermesResumeSession,
  persistHermesRuntimeThread,
  readRuntimeThreadId,
} from '../hermes-task-session';

describe('Hermes task session helpers', () => {
  it('reads a trimmed runtimeThreadId from task session metadata', () => {
    expect(readRuntimeThreadId({ runtimeThreadId: ' hermes-session-1 ' })).toBe(
      'hermes-session-1',
    );
    expect(readRuntimeThreadId({ runtimeThreadId: '' })).toBeNull();
    expect(readRuntimeThreadId({ runtimeThreadId: 123 })).toBeNull();
  });

  it('loads the resume session through the repository organization boundary', async () => {
    const repository = {
      getTaskSession: vi.fn().mockResolvedValue({
        metadata: { runtimeThreadId: 'hermes-session-2' },
      }),
    };

    await expect(
      loadHermesResumeSession({
        repository,
        organizationId: 'org-1',
        taskSessionId: 'task-session-1',
      }),
    ).resolves.toBe('hermes-session-2');

    expect(repository.getTaskSession).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
    });
  });

  it('persists a returned session id as runtimeThreadId and skips empty ids', async () => {
    const repository = {
      updateTaskSessionMetadata: vi.fn().mockResolvedValue({}),
    };

    await persistHermesRuntimeThread({
      repository,
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
      sessionId: ' hermes-session-next ',
    });
    await persistHermesRuntimeThread({
      repository,
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
      sessionId: null,
    });

    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledTimes(1);
    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'task-session-1',
      metadata: { runtimeThreadId: 'hermes-session-next' },
    });
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts
```

Expected: FAIL because `../hermes-task-session` does not exist.

- [ ] **Step 3: Implement task-session helpers**

Create `apps/server/src/agent-os/adapter/out/runtime/hermes-task-session.ts`:

```ts
import type { AgentOsRepositoryPort } from '../../../application/port/out/repository/agent-os-repository.port';

export function readRuntimeThreadId(metadata: Record<string, unknown>): string | null {
  const value = metadata.runtimeThreadId;
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function loadHermesResumeSession(input: {
  repository: Pick<AgentOsRepositoryPort, 'getTaskSession'>;
  organizationId: string;
  taskSessionId: string;
}): Promise<string | null> {
  const session = await input.repository.getTaskSession({
    organizationId: input.organizationId,
    taskSessionId: input.taskSessionId,
  });
  return readRuntimeThreadId(session?.metadata ?? {});
}

export async function persistHermesRuntimeThread(input: {
  repository: Pick<AgentOsRepositoryPort, 'updateTaskSessionMetadata'>;
  organizationId: string;
  taskSessionId: string;
  sessionId: string | null | undefined;
}): Promise<void> {
  const sessionId =
    typeof input.sessionId === 'string' && input.sessionId.trim().length > 0
      ? input.sessionId.trim()
      : null;
  if (!sessionId) return;
  await input.repository.updateTaskSessionMetadata({
    organizationId: input.organizationId,
    taskSessionId: input.taskSessionId,
    metadata: { runtimeThreadId: sessionId },
  });
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing Operator resume/persist test**

In `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`, update the mock `repository` in `makeHandler()`:

```ts
  const repository = {
    appendRunEvent: vi.fn().mockResolvedValue({}),
    listRunEvents: vi.fn().mockResolvedValue([]),
    getTaskSession: vi.fn().mockResolvedValue({
      metadata: { runtimeThreadId: 'hermes-session-existing' },
    }),
    updateTaskSessionMetadata: vi.fn().mockResolvedValue({}),
  } as unknown as AgentOsRepositoryPort;
```

Append this test inside `describe('OperatorRuntimeHandler', () => { ... })`:

```ts
  it('resumes and persists Hermes session ids for tool-loop Operator turns', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'finalized through MCP',
      stderr: '',
      durationMs: 84,
      sessionId: 'hermes-session-next',
    });
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        type: 'agent.tool_invocation.completed',
        data: {
          capabilityKey: 'agent_os_finalize_task',
          outputSummary: {
            status: 'succeeded',
            artifactIds: [],
            summary: { message: 'done' },
          },
        },
      }),
    ]);

    await handler.execute(runtimeContext());

    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeSessionId: 'hermes-session-existing',
      }),
    );
    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'session-1',
      metadata: { runtimeThreadId: 'hermes-session-next' },
    });
  });
```

- [ ] **Step 6: Update Operator runtime handler**

Modify imports in `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`:

```ts
import {
  loadHermesResumeSession,
  persistHermesRuntimeThread,
} from './hermes-task-session';
```

In `executeHermes`, before calling `this.hermesRuntime.decide`, add:

```ts
    const resumeSessionId = await loadHermesResumeSession({
      repository: this.repository,
      organizationId: context.organizationId,
      taskSessionId: context.taskSessionId,
    });
```

Pass it into `decide`:

```ts
        resumeSessionId,
```

After `runtimeResult` is available and before `operator.runtime_completed`, add:

```ts
    await persistHermesRuntimeThread({
      repository: this.repository,
      organizationId: context.organizationId,
      taskSessionId: context.taskSessionId,
      sessionId: runtimeResult.sessionId,
    });
```

In the `operator.runtime_completed` data for `executeHermes`, include:

```ts
      sessionId: runtimeResult.sessionId ?? null,
```

Apply the same `resumeSessionId` load, `resumeSessionId` input property, persistence call, and `sessionId` event field inside `executeHermesToolLoop`. When `runtimeResult` is `null`, pass `sessionId: undefined` to `persistHermesRuntimeThread` by guarding the call:

```ts
      if (runtimeResult) {
        await persistHermesRuntimeThread({
          repository: this.repository,
          organizationId: context.organizationId,
          taskSessionId: context.taskSessionId,
          sessionId: runtimeResult.sessionId,
        });
      }
```

- [ ] **Step 7: Add failing Leaf resume/persist test**

In `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`, extend the repository mock with `getTaskSession` and `updateTaskSessionMetadata`, then add:

```ts
  it('resumes and persists Hermes session ids for Leaf turns', async () => {
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(repository.getTaskSession).mockResolvedValue({
      metadata: { runtimeThreadId: 'leaf-session-existing' },
    } as Awaited<ReturnType<AgentOsRepositoryPort['getTaskSession']>>);
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'finalized through MCP',
      stderr: '',
      durationMs: 51,
      sessionId: 'leaf-session-next',
    });
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        type: 'agent.tool_invocation.completed',
        data: {
          capabilityKey: 'agent_os_finalize_task',
          outputSummary: {
            status: 'succeeded',
            artifactIds: [],
            summary: { message: 'leaf done' },
          },
        },
      }),
    ]);

    await handler.execute(runtimeContext());

    expect(hermesRuntime.decide).toHaveBeenCalledWith(
      expect.objectContaining({ resumeSessionId: 'leaf-session-existing' }),
    );
    expect(repository.updateTaskSessionMetadata).toHaveBeenCalledWith({
      organizationId: 'org-1',
      taskSessionId: 'session-1',
      metadata: { runtimeThreadId: 'leaf-session-next' },
    });
  });
```

Use the existing `runtimeContext`, `makeHandler`, and `runEvent` helpers already present in that spec file.

- [ ] **Step 8: Update Leaf runtime handler**

Modify imports in `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`:

```ts
import {
  loadHermesResumeSession,
  persistHermesRuntimeThread,
} from './hermes-task-session';
```

Before `this.hermesRuntime.decide`, add:

```ts
    const resumeSessionId = await loadHermesResumeSession({
      repository: this.repository,
      organizationId: context.organizationId,
      taskSessionId: context.taskSessionId,
    });
```

Pass it into `decide`:

```ts
        resumeSessionId,
```

After the Hermes call succeeds and before finalization is read, add:

```ts
    if (result) {
      await persistHermesRuntimeThread({
        repository: this.repository,
        organizationId: context.organizationId,
        taskSessionId: context.taskSessionId,
        sessionId: result.sessionId,
      });
    }
```

- [ ] **Step 9: Run session tests**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
rtk git add apps/server/src/agent-os/adapter/out/runtime/hermes-task-session.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
rtk git commit -m "feat: resume hermes agent sessions"
```

Expected: commit succeeds.

## Task 3: Propagate Hermes Usage To Run Cost And Observability

**Files:**
- Modify: `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`
- Modify: `apps/server/src/agent-os/__tests__/agent-run-worker-finalize.pg.integration.spec.ts`

**Interfaces:**
- Consumes: `HermesOperatorRuntimeResult.inputTokens`, `outputTokens`, `cachedInputTokens`, and `costMicros`.
- Produces: `AgentRuntimeResult` usage fields so `AgentRunExecutor` can write `AgentCostEvent` through existing `finalizeRun`.

- [ ] **Step 1: Add failing Operator cost propagation test**

Append to `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`:

```ts
  it('returns Hermes token and cost usage so AgentRunExecutor can write cost events', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes';
    const { handler, hermesRuntime } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: '{"decisionType":"delegate"}',
      stderr: '',
      durationMs: 42,
      sessionId: 'hermes-session-usage',
      inputTokens: 101,
      outputTokens: 23,
      cachedInputTokens: 7,
      costMicros: 2500n,
    });

    const result = await handler.execute(runtimeContext());

    expect(result).toMatchObject({
      provider: 'hermes',
      inputTokens: 101,
      outputTokens: 23,
      cachedInputTokens: 7,
      costMicros: 2500n,
    });
  });
```

- [ ] **Step 2: Run Operator test and verify it fails**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts
```

Expected: FAIL because `executeParsedDecision` returns only `provider` and `output`.

- [ ] **Step 3: Implement usage forwarding in Operator runtime**

In `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`, add a local type and helper near other private helper functions:

```ts
type RuntimeUsageFields = Pick<
  AgentRuntimeResult,
  'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'costMicros'
>;

function runtimeUsageFields(input: RuntimeUsageFields): RuntimeUsageFields {
  return {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedInputTokens: input.cachedInputTokens,
    costMicros: input.costMicros,
  };
}
```

Extend `executeParsedDecision` input:

```ts
    runtimeUsage?: RuntimeUsageFields;
```

Change its return object to:

```ts
    return {
      provider: input.provider,
      output: { ...execution },
      ...(input.runtimeUsage ?? {}),
    };
```

In `executeHermes`, pass usage into `executeParsedDecision`:

```ts
      runtimeUsage: runtimeUsageFields(runtimeResult),
```

In `operator.runtime_completed` event data for `executeHermes`, add:

```ts
      inputTokens: runtimeResult.inputTokens ?? null,
      outputTokens: runtimeResult.outputTokens ?? null,
      cachedInputTokens: runtimeResult.cachedInputTokens ?? null,
      costMicros: runtimeResult.costMicros?.toString() ?? null,
```

In `executeHermesToolLoop`, add the same fields to `operator.runtime_completed`, and spread them into the returned `AgentRuntimeResult`:

```ts
      return {
        provider: 'hermes_tool_loop',
        output: {
          status: finalization.status,
          artifactIds: finalization.artifactIds,
          summary: finalization.summary,
          finalizationEventId: finalization.id,
        },
        ...(runtimeResult ? runtimeUsageFields(runtimeResult) : {}),
      };
```

- [ ] **Step 4: Add failing Leaf usage propagation test**

Append to `apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts`:

```ts
  it('returns Hermes usage fields for Leaf runtime cost events', async () => {
    const { handler, hermesRuntime, repository } = makeHandler();
    vi.mocked(hermesRuntime.decide).mockResolvedValue({
      provider: 'hermes',
      rawOutput: 'finalized through MCP',
      stderr: '',
      durationMs: 64,
      sessionId: 'leaf-usage-session',
      inputTokens: 200,
      outputTokens: 50,
      cachedInputTokens: 20,
      costMicros: 4300n,
    });
    vi.mocked(repository.listRunEvents).mockResolvedValue([
      runEvent({
        type: 'agent.tool_invocation.completed',
        data: {
          capabilityKey: 'agent_os_finalize_task',
          outputSummary: {
            status: 'succeeded',
            artifactIds: [],
            summary: { message: 'leaf done' },
          },
        },
      }),
    ]);

    const result = await handler.execute(runtimeContext());

    expect(result).toMatchObject({
      provider: 'hermes',
      inputTokens: 200,
      outputTokens: 50,
      cachedInputTokens: 20,
      costMicros: 4300n,
    });
  });
```

- [ ] **Step 5: Implement usage forwarding in Leaf runtime**

In `apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts`, add a helper near the existing local functions:

```ts
function hermesUsageFields(
  result: Awaited<ReturnType<HermesOperatorRuntimeAdapter['decide']>> | null,
): Pick<
  AgentRuntimeResult,
  'inputTokens' | 'outputTokens' | 'cachedInputTokens' | 'costMicros'
> {
  return result
    ? {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedInputTokens: result.cachedInputTokens,
        costMicros: result.costMicros,
      }
    : {};
}
```

Spread the helper into the final return:

```ts
    return {
      provider: result?.provider ?? 'hermes',
      output: {
        status: finalization.status,
        artifactIds: finalization.artifactIds,
        summary: finalization.summary,
        finalizationEventId: finalization.id,
      },
      logExcerpt: result?.rawOutput ?? '',
      ...hermesUsageFields(result),
    };
```

- [ ] **Step 6: Update worker integration expectation for cost events**

Open `apps/server/src/agent-os/__tests__/agent-run-worker-finalize.pg.integration.spec.ts`. Add or update one test case so the fake runtime returns:

```ts
{
  provider: 'hermes',
  output: { ok: true },
  inputTokens: 8,
  outputTokens: 3,
  cachedInputTokens: 2,
  costMicros: 1234n,
}
```

Assert the finalized run writes a cost event through the existing repository path:

```ts
const costEvents = await repository.listCostEvents({
  organizationId,
  agentInstanceId: null,
  provider: 'hermes',
  model: null,
  fromOccurredAt: null,
  toOccurredAt: null,
  cursor: null,
  limit: 20,
});

expect(costEvents.items).toEqual([
  expect.objectContaining({
    provider: 'hermes',
    inputTokens: 8,
    outputTokens: 3,
    cachedInputTokens: 2,
    costMicros: 1234n,
  }),
]);
```

- [ ] **Step 7: Run backend runtime and worker tests**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
rtk npm run db:test:up
rtk npm run db:test:prepare
rtk npm run test:integration --workspace=apps/server -- src/agent-os/__tests__/agent-run-worker-finalize.pg.integration.spec.ts
```

Expected: unit tests PASS and the integration test PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
rtk git add apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts apps/server/src/agent-os/adapter/out/runtime/hermes-leaf-runtime.handler.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts apps/server/src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts apps/server/src/agent-os/__tests__/agent-run-worker-finalize.pg.integration.spec.ts
rtk git commit -m "feat: report hermes agent usage"
```

Expected: commit succeeds.

## Task 4: Build Agent Office API Client And View Model

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/app/(automation)/agents/lib/agent-os-api.ts`
- Create: `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`
- Create: `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`

**Interfaces:**
- Consumes: shared Agent OS DTO types from `@kiditem/shared/agent-os`.
- Produces:

```ts
export type AgentOfficeNodeStatus = 'working' | 'waiting' | 'blocked' | 'idle' | 'offline';
export interface AgentOfficeNode { id: string; name: string; agentType: string; status: AgentOfficeNodeStatus; x: number; y: number; activeRunCount: number; pendingApprovalCount: number; lastActivityAt: string | null; }
export interface AgentOfficeActivity { id: string; kind: 'run' | 'request' | 'approval' | 'cost' | 'authorization' | 'conversation'; label: string; status: string; occurredAt: string; agentInstanceId: string | null; }
export interface AgentOfficeViewModel { nodes: AgentOfficeNode[]; activities: AgentOfficeActivity[]; totals: { agents: number; working: number; waiting: number; blocked: number; pendingApprovals: number; runningRuns: number; totalCostMicros: string; }; }
export function buildAgentOfficeModel(input: BuildAgentOfficeModelInput): AgentOfficeViewModel;
```

- [ ] **Step 1: Add failing view-model tests**

Create `apps/web/src/app/(automation)/agents/lib/agent-office-model.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAgentOfficeModel } from './agent-office-model';

describe('buildAgentOfficeModel', () => {
  it('derives office node statuses from runs, requests, and approvals', () => {
    const model = buildAgentOfficeModel({
      instances: [
        {
          id: 'agent-manager',
          organizationId: 'org-1',
          type: 'manager',
          name: 'Operator',
          role: 'orchestrator',
          title: '대표실',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 1,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
        {
          id: 'agent-sourcing',
          organizationId: 'org-1',
          type: 'sourcing',
          name: 'Sourcing Agent',
          role: 'specialist',
          title: '소싱 데스크',
          icon: null,
          reportsToId: 'agent-manager',
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 0,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
      ],
      runs: [
        {
          id: 'run-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-manager',
          requestId: 'request-1',
          taskKey: 'conversation:conversation-1',
          status: 'running',
          attempt: 1,
          invocationSource: 'agent_os_conversation',
          adapterType: 'hermes_local',
          model: 'gpt-5.1-codex',
          provider: 'hermes',
          startedAt: '2026-07-09T00:00:00.000Z',
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          output: null,
          costMicros: null,
        },
      ],
      requests: [
        {
          id: 'request-2',
          organizationId: 'org-1',
          agentInstanceId: 'agent-sourcing',
          agentType: 'sourcing',
          taskKey: 'conversation:conversation-1:sourcing',
          source: 'agent_os_conversation',
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: 'requires_approval',
          priority: 5,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: '2026-07-09T00:01:00.000Z',
          claimedAt: null,
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: '2026-07-09T00:01:00.000Z',
        },
      ],
      approvals: [
        {
          id: 'approval-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-sourcing',
          requestId: 'request-2',
          runId: null,
          status: 'pending',
          reasonCode: 'approval_required',
          reason: '발주 전 확인',
          prompt: null,
          payload: {},
          actionSnapshot: null,
          requestedByActorType: 'agent',
          requestedByActorId: 'agent-sourcing',
          requestedByUserId: null,
          approverUserId: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionReason: null,
          expiresAt: null,
          createdAt: '2026-07-09T00:02:00.000Z',
          updatedAt: '2026-07-09T00:02:00.000Z',
        },
      ],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: '0',
    });

    expect(model.nodes.map((node) => [node.id, node.status])).toEqual([
      ['agent-manager', 'working'],
      ['agent-sourcing', 'blocked'],
    ]);
    expect(model.totals).toMatchObject({
      agents: 2,
      working: 1,
      blocked: 1,
      pendingApprovals: 1,
      runningRuns: 1,
      totalCostMicros: '0',
    });
  });

  it('sorts activities with newest first', () => {
    const model = buildAgentOfficeModel({
      instances: [],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [
        {
          id: 'conversation-1',
          organizationId: 'org-1',
          title: '첫 대화',
          status: 'active',
          createdByUserId: 'user-1',
          rootRequestId: null,
          lastMessageAt: '2026-07-09T00:05:00.000Z',
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:05:00.000Z',
        },
      ],
      costEvents: [
        {
          id: 'cost-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-manager',
          requestId: 'request-1',
          runId: 'run-1',
          provider: 'hermes',
          model: 'gpt-5.1-codex',
          inputTokens: 10,
          outputTokens: 4,
          cachedInputTokens: 2,
          costMicros: '1000',
          occurredAt: '2026-07-09T00:03:00.000Z',
        },
      ],
      authorizationEvents: [],
      totalCostMicros: '1000',
    });

    expect(model.activities.map((activity) => activity.id)).toEqual([
      'conversation-1',
      'cost-1',
    ]);
  });
});
```

- [ ] **Step 2: Run view-model tests and verify they fail**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/lib/agent-office-model.spec.ts
```

Expected: FAIL because `agent-office-model.ts` does not exist.

- [ ] **Step 3: Implement view model**

Create `apps/web/src/app/(automation)/agents/lib/agent-office-model.ts`:

```ts
import type {
  AgentApprovalRequestSummary,
  AgentAuthorizationEventSummary,
  AgentConversationSummary,
  AgentCostEventSummary,
  AgentInstanceSummary,
  AgentRunRequestSummary,
  AgentRunSummary,
} from '@kiditem/shared/agent-os';

export type AgentOfficeNodeStatus =
  | 'working'
  | 'waiting'
  | 'blocked'
  | 'idle'
  | 'offline';

export interface AgentOfficeNode {
  id: string;
  name: string;
  agentType: string;
  title: string | null;
  status: AgentOfficeNodeStatus;
  x: number;
  y: number;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastActivityAt: string | null;
}

export interface AgentOfficeActivity {
  id: string;
  kind:
    | 'run'
    | 'request'
    | 'approval'
    | 'cost'
    | 'authorization'
    | 'conversation';
  label: string;
  status: string;
  occurredAt: string;
  agentInstanceId: string | null;
}

export interface AgentOfficeViewModel {
  nodes: AgentOfficeNode[];
  activities: AgentOfficeActivity[];
  totals: {
    agents: number;
    working: number;
    waiting: number;
    blocked: number;
    pendingApprovals: number;
    runningRuns: number;
    totalCostMicros: string;
  };
}

export interface BuildAgentOfficeModelInput {
  instances: AgentInstanceSummary[];
  runs: AgentRunSummary[];
  requests: AgentRunRequestSummary[];
  approvals: AgentApprovalRequestSummary[];
  conversations: AgentConversationSummary[];
  costEvents: AgentCostEventSummary[];
  authorizationEvents: AgentAuthorizationEventSummary[];
  totalCostMicros: string;
}

const OFFICE_POSITIONS = [
  { x: 18, y: 24 },
  { x: 42, y: 18 },
  { x: 66, y: 28 },
  { x: 30, y: 55 },
  { x: 56, y: 58 },
  { x: 78, y: 52 },
] as const;

function latestDate(values: Array<string | null | undefined>): string | null {
  const sorted = values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return sorted[0] ?? null;
}

function statusFor(input: {
  instance: AgentInstanceSummary;
  activeRunCount: number;
  waitingRequestCount: number;
  pendingApprovalCount: number;
}): AgentOfficeNodeStatus {
  if (input.instance.lifecycleStatus !== 'active') return 'offline';
  if (input.pendingApprovalCount > 0) return 'blocked';
  if (input.activeRunCount > 0) return 'working';
  if (input.waitingRequestCount > 0) return 'waiting';
  return 'idle';
}

function activityTime(activity: AgentOfficeActivity): number {
  const parsed = Date.parse(activity.occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAgentOfficeModel(
  input: BuildAgentOfficeModelInput,
): AgentOfficeViewModel {
  const runsByAgent = new Map<string, AgentRunSummary[]>();
  const requestsByAgent = new Map<string, AgentRunRequestSummary[]>();
  const approvalsByAgent = new Map<string, AgentApprovalRequestSummary[]>();

  for (const run of input.runs) {
    runsByAgent.set(run.agentInstanceId, [
      ...(runsByAgent.get(run.agentInstanceId) ?? []),
      run,
    ]);
  }
  for (const request of input.requests) {
    requestsByAgent.set(request.agentInstanceId, [
      ...(requestsByAgent.get(request.agentInstanceId) ?? []),
      request,
    ]);
  }
  for (const approval of input.approvals) {
    approvalsByAgent.set(approval.agentInstanceId, [
      ...(approvalsByAgent.get(approval.agentInstanceId) ?? []),
      approval,
    ]);
  }

  const nodes = input.instances.map((instance, index) => {
    const runs = runsByAgent.get(instance.id) ?? [];
    const requests = requestsByAgent.get(instance.id) ?? [];
    const approvals = approvalsByAgent.get(instance.id) ?? [];
    const activeRunCount = runs.filter((run) => run.status === 'running').length;
    const waitingRequestCount = requests.filter((request) =>
      ['pending', 'claimed'].includes(request.status),
    ).length;
    const pendingApprovalCount = approvals.filter(
      (approval) => approval.status === 'pending',
    ).length;
    const position = OFFICE_POSITIONS[index % OFFICE_POSITIONS.length];

    return {
      id: instance.id,
      name: instance.name,
      agentType: instance.type,
      title: instance.title,
      status: statusFor({
        instance,
        activeRunCount,
        waitingRequestCount,
        pendingApprovalCount,
      }),
      x: position.x,
      y: position.y,
      activeRunCount,
      pendingApprovalCount,
      lastActivityAt: latestDate([
        ...runs.map((run) => run.finishedAt ?? run.startedAt),
        ...requests.map(
          (request) =>
            request.finishedAt ??
            request.claimedAt ??
            request.scheduledFor ??
            request.createdAt,
        ),
        ...approvals.map((approval) => approval.updatedAt),
      ]),
    };
  });

  const activities: AgentOfficeActivity[] = [
    ...input.runs.map((run) => ({
      id: run.id,
      kind: 'run' as const,
      label: `실행 ${run.status}`,
      status: run.status,
      occurredAt: run.finishedAt ?? run.startedAt,
      agentInstanceId: run.agentInstanceId,
    })),
    ...input.requests.map((request) => ({
      id: request.id,
      kind: 'request' as const,
      label: `요청 ${request.status}`,
      status: request.status,
      occurredAt:
        request.finishedAt ??
        request.claimedAt ??
        request.scheduledFor ??
        request.createdAt,
      agentInstanceId: request.agentInstanceId,
    })),
    ...input.approvals.map((approval) => ({
      id: approval.id,
      kind: 'approval' as const,
      label: approval.reason ?? approval.reasonCode ?? '승인 요청',
      status: approval.status,
      occurredAt: approval.updatedAt,
      agentInstanceId: approval.agentInstanceId,
    })),
    ...input.costEvents.map((event) => ({
      id: event.id,
      kind: 'cost' as const,
      label: `${event.provider} ${event.costMicros}µ`,
      status: event.model,
      occurredAt: event.occurredAt,
      agentInstanceId: event.agentInstanceId,
    })),
    ...input.authorizationEvents.map((event) => ({
      id: event.id,
      kind: 'authorization' as const,
      label: event.reason ?? event.action,
      status: event.decision,
      occurredAt: event.createdAt,
      agentInstanceId: event.agentInstanceId,
    })),
    ...input.conversations.map((conversation) => ({
      id: conversation.id,
      kind: 'conversation' as const,
      label: conversation.title,
      status: conversation.status,
      occurredAt: conversation.lastMessageAt ?? conversation.updatedAt,
      agentInstanceId: null,
    })),
  ].sort((a, b) => activityTime(b) - activityTime(a));

  return {
    nodes,
    activities: activities.slice(0, 80),
    totals: {
      agents: nodes.length,
      working: nodes.filter((node) => node.status === 'working').length,
      waiting: nodes.filter((node) => node.status === 'waiting').length,
      blocked: nodes.filter((node) => node.status === 'blocked').length,
      pendingApprovals: input.approvals.filter(
        (approval) => approval.status === 'pending',
      ).length,
      runningRuns: input.runs.filter((run) => run.status === 'running').length,
      totalCostMicros: input.totalCostMicros,
    },
  };
}
```

- [ ] **Step 4: Expand route API client**

Modify imports in `apps/web/src/app/(automation)/agents/lib/agent-os-api.ts`:

```ts
  AgentApprovalRequestSummary,
  AgentApprovalStatus,
  AgentAuthorizationDecision,
  AgentAuthorizationEventSummary,
  AgentConversationSummary,
  AgentCostEventSummary,
  AgentMessage,
  AgentRunGraph,
```

Add these methods inside `agentOsApi`:

```ts
  listConversations: () =>
    apiClient.get<{ items: AgentConversationSummary[] }>(
      '/api/agent-os/conversations',
    ),

  createConversation: (input: { content: string }) =>
    apiClient.post<{
      conversation: AgentConversationSummary;
      message: AgentMessage;
      rootRequestId: string | null;
    }>('/api/agent-os/conversations', input),

  listMessages: (conversationId: string) =>
    apiClient.get<{ items: AgentMessage[] }>(
      `/api/agent-os/conversations/${conversationId}/messages`,
    ),

  sendMessage: (conversationId: string, input: { content: string }) =>
    apiClient.post<{
      conversation: AgentConversationSummary;
      message: AgentMessage;
      rootRequestId: string | null;
    }>(`/api/agent-os/conversations/${conversationId}/messages`, input),

  getConversationGraph: (conversationId: string) =>
    apiClient.get<AgentRunGraph>(
      `/api/agent-os/conversations/${conversationId}/graph`,
    ),

  listApprovals: (params: {
    status?: AgentApprovalStatus[];
    agentInstanceId?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.status?.length) qs.set('status', params.status.join(','));
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentApprovalRequestSummary[] }>(
      `/api/agent-os/approvals${q ? `?${q}` : ''}`,
    );
  },

  resolveApproval: (
    approvalRequestId: string,
    input: { status: 'approved' | 'rejected'; decisionReason?: string },
  ) =>
    apiClient.post<AgentApprovalRequestSummary>(
      `/api/agent-os/approvals/${approvalRequestId}/resolve`,
      input,
    ),

  listCostEvents: (params: {
    agentInstanceId?: string;
    provider?: string;
    model?: string;
    fromOccurredAt?: string;
    toOccurredAt?: string;
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.provider) qs.set('provider', params.provider);
    if (params.model) qs.set('model', params.model);
    if (params.fromOccurredAt) qs.set('fromOccurredAt', params.fromOccurredAt);
    if (params.toOccurredAt) qs.set('toOccurredAt', params.toOccurredAt);
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{
      items: AgentCostEventSummary[];
      totalCostMicros: string;
    }>(`/api/agent-os/cost-events${q ? `?${q}` : ''}`);
  },

  listAuthorizationEvents: (params: {
    agentInstanceId?: string;
    decision?: AgentAuthorizationDecision[];
    cursor?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.agentInstanceId) qs.set('agentInstanceId', params.agentInstanceId);
    if (params.decision?.length) qs.set('decision', params.decision.join(','));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<{ items: AgentAuthorizationEventSummary[] }>(
      `/api/agent-os/authorization-events${q ? `?${q}` : ''}`,
    );
  },
```

- [ ] **Step 5: Add Agent HQ query keys**

Modify `apps/web/src/lib/query-keys.ts` inside `agents`:

```ts
    hq: () => [...queryKeys.agents.all, 'hq'] as const,
    hqMessages: (conversationId: string) =>
      [...queryKeys.agents.all, 'hqMessages', conversationId] as const,
```

- [ ] **Step 6: Run frontend model tests**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/lib/agent-office-model.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
rtk git add apps/web/src/lib/query-keys.ts apps/web/src/app/\\(automation\\)/agents/lib/agent-os-api.ts apps/web/src/app/\\(automation\\)/agents/lib/agent-office-model.ts apps/web/src/app/\\(automation\\)/agents/lib/agent-office-model.spec.ts
rtk git commit -m "feat: model agent office state"
```

Expected: commit succeeds.

## Task 5: Build Agent Office Presentation Components

**Files:**
- Create: `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentOfficeNode.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentInspector.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentCommandBar.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentActivityDrawer.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentStatusRail.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx`
- Create: `apps/web/src/app/(automation)/agents/components/AgentCommandBar.spec.tsx`

**Interfaces:**
- Consumes: `AgentOfficeViewModel`, selected node state, command input state.
- Produces: reusable route-local components for the HQ route.

- [ ] **Step 1: Add component tests**

Create `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentOfficeMap } from './AgentOfficeMap';
import type { AgentOfficeNode } from '../lib/agent-office-model';

const nodes: AgentOfficeNode[] = [
  {
    id: 'agent-manager',
    name: 'Operator',
    agentType: 'manager',
    title: '대표실',
    status: 'working',
    x: 20,
    y: 30,
    activeRunCount: 1,
    pendingApprovalCount: 0,
    lastActivityAt: '2026-07-09T00:00:00.000Z',
  },
];

describe('AgentOfficeMap', () => {
  it('renders staff nodes and notifies selection', () => {
    const onSelectNode = vi.fn();

    render(
      <AgentOfficeMap
        nodes={nodes}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Operator/ }));
    expect(onSelectNode).toHaveBeenCalledWith('agent-manager');
  });
});
```

Create `apps/web/src/app/(automation)/agents/components/AgentCommandBar.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentCommandBar } from './AgentCommandBar';

describe('AgentCommandBar', () => {
  it('submits non-empty commands', () => {
    const onSubmit = vi.fn();

    render(
      <AgentCommandBar
        value="소싱 현황 알려줘"
        pending={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(screen.getByRole('form', { name: 'Agent command' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables submit while blank or pending', () => {
    const { rerender } = render(
      <AgentCommandBar value=" " pending={false} onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();

    rerender(
      <AgentCommandBar value="발주 확인" pending onChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run component tests and verify they fail**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/components/AgentOfficeMap.spec.tsx src/app/\\(automation\\)/agents/components/AgentCommandBar.spec.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement command bar**

Create `apps/web/src/app/(automation)/agents/components/AgentCommandBar.tsx`:

```tsx
'use client';

import { SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AgentCommandBar({
  value,
  pending,
  onChange,
  onSubmit,
}: {
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const disabled = pending || value.trim().length === 0;

  return (
    <form
      aria-label="Agent command"
      className="flex min-h-[56px] items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
        placeholder="직원에게 요청하기"
      />
      <button
        type="submit"
        disabled={disabled}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-md border text-sm transition',
          disabled
            ? 'border-[var(--border-subtle)] text-[var(--text-disabled)]'
            : 'border-[var(--primary)] bg-[var(--primary)] text-white hover:brightness-105',
        )}
        aria-label="전송"
      >
        <SendHorizonal size={18} />
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Implement office node**

Create `apps/web/src/app/(automation)/agents/components/AgentOfficeNode.tsx`:

```tsx
'use client';

import { Bot, CircleAlert, Clock3, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentOfficeNode as AgentOfficeNodeModel } from '../lib/agent-office-model';

const STATUS_CLASS = {
  working: 'border-sky-400 bg-sky-50 text-sky-800',
  waiting: 'border-amber-400 bg-amber-50 text-amber-800',
  blocked: 'border-rose-400 bg-rose-50 text-rose-800',
  idle: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  offline: 'border-slate-300 bg-slate-100 text-slate-500',
} satisfies Record<AgentOfficeNodeModel['status'], string>;

function StatusIcon({ status }: { status: AgentOfficeNodeModel['status'] }) {
  if (status === 'blocked') return <CircleAlert size={14} />;
  if (status === 'waiting') return <Clock3 size={14} />;
  if (status === 'offline') return <PauseCircle size={14} />;
  return <Bot size={14} />;
}

export function AgentOfficeNode({
  node,
  selected,
  onSelect,
}: {
  node: AgentOfficeNodeModel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      className={cn(
        'absolute flex h-[74px] w-[142px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border px-3 text-left shadow-sm transition hover:-translate-y-[53%] hover:shadow-md',
        STATUS_CLASS[node.status],
        selected && 'ring-2 ring-[var(--primary)] ring-offset-2',
      )}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80">
        <StatusIcon status={node.status} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{node.name}</span>
        <span className="block truncate text-[11px]">{node.title ?? node.agentType}</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 5: Implement office map**

Create `apps/web/src/app/(automation)/agents/components/AgentOfficeMap.tsx`:

```tsx
'use client';

import { AgentOfficeNode } from './AgentOfficeNode';
import type { AgentOfficeNode as AgentOfficeNodeModel } from '../lib/agent-office-model';

export function AgentOfficeMap({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: AgentOfficeNodeModel[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}) {
  return (
    <section className="relative min-h-[520px] overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
      <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(90deg,rgba(148,163,184,.18)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,.18)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute left-[8%] top-[12%] h-24 w-32 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]" />
      <div className="absolute bottom-[12%] right-[10%] h-28 w-44 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]" />
      <div className="absolute bottom-[18%] left-[10%] h-20 w-24 rounded-full border border-emerald-200 bg-emerald-50" />
      {nodes.map((node) => (
        <AgentOfficeNode
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          onSelect={onSelectNode}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Implement inspector**

Create `apps/web/src/app/(automation)/agents/components/AgentInspector.tsx`:

```tsx
'use client';

import { ShieldCheck, TimerReset } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AgentOfficeNode } from '../lib/agent-office-model';

export function AgentInspector({ node }: { node: AgentOfficeNode | null }) {
  if (!node) {
    return (
      <aside className="min-h-[260px] border-l border-[var(--border-subtle)] bg-[var(--surface)] p-4 text-sm text-[var(--text-tertiary)]">
        직원을 선택하세요.
      </aside>
    );
  }

  return (
    <aside className="min-h-[260px] border-l border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {node.name}
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">{node.title ?? node.agentType}</p>
        </div>
        <span className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
          {node.status}
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-[var(--border-subtle)] p-3">
          <dt className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <TimerReset size={13} /> 실행
          </dt>
          <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {node.activeRunCount}
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border-subtle)] p-3">
          <dt className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <ShieldCheck size={13} /> 승인
          </dt>
          <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {node.pendingApprovalCount}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-[var(--text-tertiary)]">
        마지막 활동 {node.lastActivityAt ? formatDateTime(node.lastActivityAt) : '없음'}
      </p>
    </aside>
  );
}
```

- [ ] **Step 7: Implement activity drawer**

Create `apps/web/src/app/(automation)/agents/components/AgentActivityDrawer.tsx`:

```tsx
'use client';

import { Activity, BadgeCheck, Coins, LockKeyhole, MessageSquare, PlayCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { AgentOfficeActivity } from '../lib/agent-office-model';

function ActivityIcon({ kind }: { kind: AgentOfficeActivity['kind'] }) {
  if (kind === 'approval') return <BadgeCheck size={14} />;
  if (kind === 'cost') return <Coins size={14} />;
  if (kind === 'authorization') return <LockKeyhole size={14} />;
  if (kind === 'conversation') return <MessageSquare size={14} />;
  if (kind === 'run') return <PlayCircle size={14} />;
  return <Activity size={14} />;
}

export function AgentActivityDrawer({
  activities,
}: {
  activities: AgentOfficeActivity[];
}) {
  return (
    <section className="max-h-[220px] overflow-auto border-t border-[var(--border-subtle)] bg-[var(--surface)]">
      <ul className="divide-y divide-[var(--border-subtle)]">
        {activities.slice(0, 20).map((activity) => (
          <li key={`${activity.kind}:${activity.id}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              <ActivityIcon kind={activity.kind} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[var(--text-primary)]">
                {activity.label}
              </span>
              <span className="block truncate text-[var(--text-tertiary)]">
                {activity.status} · {formatDateTime(activity.occurredAt)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8: Implement status rail**

Create `apps/web/src/app/(automation)/agents/components/AgentStatusRail.tsx`:

```tsx
'use client';

import { CircleAlert, Clock3, Coins, UsersRound, Zap } from 'lucide-react';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentStatusRail({ totals }: { totals: AgentOfficeViewModel['totals'] }) {
  const items = [
    { label: '직원', value: totals.agents, icon: UsersRound },
    { label: '작업', value: totals.working, icon: Zap },
    { label: '대기', value: totals.waiting, icon: Clock3 },
    { label: '승인', value: totals.pendingApprovals, icon: CircleAlert },
    { label: '비용', value: totals.totalCostMicros, icon: Coins },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface)] p-3 md:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="flex min-h-14 items-center gap-2 rounded-md border border-[var(--border-subtle)] px-3">
            <Icon size={15} className="text-[var(--text-tertiary)]" />
            <span className="min-w-0">
              <span className="block text-[11px] text-[var(--text-tertiary)]">{item.label}</span>
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{item.value}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 9: Implement shell**

Create `apps/web/src/app/(automation)/agents/components/AgentOfficeShell.tsx`:

```tsx
'use client';

import { RefreshCw } from 'lucide-react';
import { AgentActivityDrawer } from './AgentActivityDrawer';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentInspector } from './AgentInspector';
import { AgentOfficeMap } from './AgentOfficeMap';
import { AgentStatusRail } from './AgentStatusRail';
import type { AgentOfficeViewModel } from '../lib/agent-office-model';

export function AgentOfficeShell({
  model,
  selectedNodeId,
  command,
  commandPending,
  refreshing,
  onSelectNode,
  onCommandChange,
  onSubmitCommand,
  onRefresh,
}: {
  model: AgentOfficeViewModel;
  selectedNodeId: string | null;
  command: string;
  commandPending: boolean;
  refreshing: boolean;
  onSelectNode: (id: string) => void;
  onCommandChange: (value: string) => void;
  onSubmitCommand: () => void;
  onRefresh: () => void;
}) {
  const selectedNode =
    model.nodes.find((node) => node.id === selectedNodeId) ?? model.nodes[0] ?? null;

  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-[var(--text-primary)]">
            Agent OS HQ
          </h1>
          <p className="truncate text-xs text-[var(--text-tertiary)]">
            Operator · Hermes · KidItem MCP
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          aria-label="새로고침"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </header>
      <AgentStatusRail totals={model.totals} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
        <AgentOfficeMap
          nodes={model.nodes}
          selectedNodeId={selectedNode?.id ?? null}
          onSelectNode={onSelectNode}
        />
        <AgentInspector node={selectedNode} />
      </div>
      <AgentActivityDrawer activities={model.activities} />
      <AgentCommandBar
        value={command}
        pending={commandPending}
        onChange={onCommandChange}
        onSubmit={onSubmitCommand}
      />
    </div>
  );
}
```

- [ ] **Step 10: Run component tests and verify they pass**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/components/AgentOfficeMap.spec.tsx src/app/\\(automation\\)/agents/components/AgentCommandBar.spec.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit Task 5**

Run:

```bash
rtk git add apps/web/src/app/\\(automation\\)/agents/components
rtk git commit -m "feat: add agent office hq components"
```

Expected: commit succeeds.

## Task 6: Wire Agent Office Page And Conversation Commands

**Files:**
- Create: `apps/web/src/app/(automation)/agents/hooks/useAgentOffice.ts`
- Modify: `apps/web/src/app/(automation)/agents/page.tsx`
- Create: `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx`

**Interfaces:**
- Consumes: `agentOsApi`, `queryKeys.agents`, and `buildAgentOfficeModel`.
- Produces:

```ts
export function useAgentOffice(): {
  model: AgentOfficeViewModel;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string) => void;
  command: string;
  setCommand: (value: string) => void;
  submitCommand: () => void;
  commandPending: boolean;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  refresh: () => void;
};
```

- [ ] **Step 1: Create page test**

Create `apps/web/src/app/(automation)/agents/__tests__/page.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentOsOpsPage from '../page';

vi.mock('../hooks/useAgentOffice', () => ({
  useAgentOffice: () => ({
    model: {
      nodes: [
        {
          id: 'agent-manager',
          name: 'Operator',
          agentType: 'manager',
          title: '대표실',
          status: 'idle',
          x: 18,
          y: 24,
          activeRunCount: 0,
          pendingApprovalCount: 0,
          lastActivityAt: null,
        },
      ],
      activities: [],
      totals: {
        agents: 1,
        working: 0,
        waiting: 0,
        blocked: 0,
        pendingApprovals: 0,
        runningRuns: 0,
        totalCostMicros: '0',
      },
    },
    selectedNodeId: 'agent-manager',
    setSelectedNodeId: vi.fn(),
    command: '',
    setCommand: vi.fn(),
    submitCommand: vi.fn(),
    commandPending: false,
    isPending: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe('Agent OS HQ page', () => {
  it('renders the virtual office HQ shell', () => {
    render(<AgentOsOpsPage />);

    expect(screen.getByText('Agent OS HQ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operator/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('직원에게 요청하기')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run page test and verify it fails**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/__tests__/page.spec.tsx
```

Expected: FAIL because `useAgentOffice` does not exist and `page.tsx` still renders the old table screen.

- [ ] **Step 3: Implement `useAgentOffice`**

Create `apps/web/src/app/(automation)/agents/hooks/useAgentOffice.ts`:

```ts
'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { agentOsApi } from '../lib/agent-os-api';
import {
  buildAgentOfficeModel,
  type AgentOfficeViewModel,
} from '../lib/agent-office-model';

const EMPTY_MODEL: AgentOfficeViewModel = {
  nodes: [],
  activities: [],
  totals: {
    agents: 0,
    working: 0,
    waiting: 0,
    blocked: 0,
    pendingApprovals: 0,
    runningRuns: 0,
    totalCostMicros: '0',
  },
};

function shouldPoll(statuses: string[]): boolean {
  return statuses.some((status) =>
    ['running', 'pending', 'claimed', 'requires_approval'].includes(status),
  );
}

export function useAgentOffice() {
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [command, setCommand] = useState('');

  const instancesQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => agentOsApi.listInstances(),
    staleTime: 60_000,
  });

  const runsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'runs'],
    queryFn: () =>
      agentOsApi.listRuns({
        status: ['running', 'succeeded', 'failed', 'cancelled'],
        limit: 100,
      }),
    refetchInterval: (query) =>
      shouldPoll((query.state.data?.items ?? []).map((item) => item.status))
        ? 10_000
        : 45_000,
  });

  const requestsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'requests'],
    queryFn: () =>
      agentOsApi.listRequests({
        status: ['pending', 'claimed', 'requires_approval', 'succeeded', 'failed'],
        limit: 100,
      }),
    refetchInterval: (query) =>
      shouldPoll((query.state.data?.items ?? []).map((item) => item.status))
        ? 10_000
        : 45_000,
  });

  const approvalsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'approvals'],
    queryFn: () => agentOsApi.listApprovals({ status: ['pending'], limit: 100 }),
    refetchInterval: 45_000,
  });

  const conversationsQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'conversations'],
    queryFn: () => agentOsApi.listConversations(),
    refetchInterval: 45_000,
  });

  const costQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'cost'],
    queryFn: () => agentOsApi.listCostEvents({ limit: 50 }),
    refetchInterval: 60_000,
  });

  const authorizationQuery = useQuery({
    queryKey: [...queryKeys.agents.hq(), 'authorization'],
    queryFn: () => agentOsApi.listAuthorizationEvents({ limit: 50 }),
    refetchInterval: 60_000,
  });

  const createConversation = useMutation({
    mutationFn: (content: string) => agentOsApi.createConversation({ content }),
    onSuccess: (result) => {
      setConversationId(result.conversation.id);
      setCommand('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (input: { conversationId: string; content: string }) =>
      agentOsApi.sendMessage(input.conversationId, { content: input.content }),
    onSuccess: (result) => {
      setConversationId(result.conversation.id);
      setCommand('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
    },
  });

  const model = useMemo(() => {
    if (!instancesQuery.data) return EMPTY_MODEL;
    return buildAgentOfficeModel({
      instances: instancesQuery.data,
      runs: runsQuery.data?.items ?? [],
      requests: requestsQuery.data?.items ?? [],
      approvals: approvalsQuery.data?.items ?? [],
      conversations: conversationsQuery.data?.items ?? [],
      costEvents: costQuery.data?.items ?? [],
      authorizationEvents: authorizationQuery.data?.items ?? [],
      totalCostMicros: costQuery.data?.totalCostMicros ?? '0',
    });
  }, [
    approvalsQuery.data,
    authorizationQuery.data,
    conversationsQuery.data,
    costQuery.data,
    instancesQuery.data,
    requestsQuery.data,
    runsQuery.data,
  ]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.agents.hq() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.agents.list() });
  };

  const submitCommand = () => {
    const content = command.trim();
    if (!content) return;
    if (conversationId) {
      sendMessage.mutate({ conversationId, content });
      return;
    }
    createConversation.mutate(content);
  };

  return {
    model,
    selectedNodeId: selectedNodeId ?? model.nodes[0]?.id ?? null,
    setSelectedNodeId,
    command,
    setCommand,
    submitCommand,
    commandPending: createConversation.isPending || sendMessage.isPending,
    isPending: instancesQuery.isPending,
    isFetching:
      instancesQuery.isFetching ||
      runsQuery.isFetching ||
      requestsQuery.isFetching ||
      approvalsQuery.isFetching ||
      conversationsQuery.isFetching ||
      costQuery.isFetching ||
      authorizationQuery.isFetching,
    error:
      instancesQuery.error ??
      runsQuery.error ??
      requestsQuery.error ??
      approvalsQuery.error ??
      conversationsQuery.error ??
      costQuery.error ??
      authorizationQuery.error ??
      createConversation.error ??
      sendMessage.error,
    refresh,
  };
}
```

- [ ] **Step 4: Replace page implementation**

Replace `apps/web/src/app/(automation)/agents/page.tsx` with:

```tsx
'use client';

import PageSkeleton from '@/components/ui/PageSkeleton';
import { isApiError } from '@/lib/api-error';
import { AgentOfficeShell } from './components/AgentOfficeShell';
import { useAgentOffice } from './hooks/useAgentOffice';

export default function AgentOsOpsPage() {
  const office = useAgentOffice();

  if (office.isPending) return <PageSkeleton variant="dashboard" />;

  if (office.error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Agent OS HQ를 불러오지 못했습니다.{' '}
          {isApiError(office.error)
            ? office.error.detail
            : office.error instanceof Error
              ? office.error.message
              : ''}
        </div>
      </div>
    );
  }

  return (
    <AgentOfficeShell
      model={office.model}
      selectedNodeId={office.selectedNodeId}
      command={office.command}
      commandPending={office.commandPending}
      refreshing={office.isFetching}
      onSelectNode={office.setSelectedNodeId}
      onCommandChange={office.setCommand}
      onSubmitCommand={office.submitCommand}
      onRefresh={office.refresh}
    />
  );
}
```

- [ ] **Step 5: Run page and component tests**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/__tests__/page.spec.tsx src/app/\\(automation\\)/agents/components/AgentOfficeMap.spec.tsx src/app/\\(automation\\)/agents/components/AgentCommandBar.spec.tsx src/app/\\(automation\\)/agents/lib/agent-office-model.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
rtk git add apps/web/src/app/\\(automation\\)/agents/hooks/useAgentOffice.ts apps/web/src/app/\\(automation\\)/agents/page.tsx apps/web/src/app/\\(automation\\)/agents/__tests__/page.spec.tsx
rtk git commit -m "feat: wire agent office hq"
```

Expected: commit succeeds.

## Task 7: Final Verification And Browser QA

**Files:**
- Modify only files from Tasks 1-6 if verification reveals a concrete defect.

**Interfaces:**
- Consumes: completed backend and frontend changes.
- Produces: verified Agent OS HQ implementation branch.

- [ ] **Step 1: Run all narrow backend tests**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/hermes-runtime-output.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-task-session.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-operator-runtime.adapter.spec.ts src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/adapter/out/runtime/__tests__/hermes-leaf-runtime.handler.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
rtk npm run build --workspace=apps/server
```

Expected: PASS.

- [ ] **Step 3: Run Agent OS backend boot gate**

Run:

```bash
rtk npm run dev:server
```

Expected: NestJS boots and logs the server listening message. Stop it with `Ctrl-C` after boot is confirmed.

- [ ] **Step 4: Run all narrow frontend tests**

Run:

```bash
rtk npm run test --workspace=apps/web -- src/app/\\(automation\\)/agents/lib/agent-office-model.spec.ts src/app/\\(automation\\)/agents/components/AgentOfficeMap.spec.tsx src/app/\\(automation\\)/agents/components/AgentCommandBar.spec.tsx src/app/\\(automation\\)/agents/__tests__/page.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```bash
rtk npm run build --workspace=apps/web
```

Expected: PASS.

- [ ] **Step 6: Run full frontend Vitest gate**

Run:

```bash
rtk npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Start local web app for visual QA**

Run:

```bash
rtk npm run dev --workspace=apps/web
```

Expected: Next.js serves `http://localhost:3000/`.

- [ ] **Step 8: Browser QA the HQ surface**

Open `http://localhost:3000/agents` in the in-app browser and verify:

- The first screen is the HQ workspace, not the old run/request tables.
- Office nodes fit on desktop width and narrow mobile width without text overlap.
- Selecting a node updates the inspector.
- Refresh button spins while queries fetch.
- Blank command cannot submit.
- Non-empty command creates or continues an Agent OS conversation through `/api/agent-os/conversations`.

- [ ] **Step 9: Run reconstruction and boundary checks before PR**

Run:

```bash
rtk npm run check:web-db-boundary
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: PASS.

- [ ] **Step 10: Commit verification fixes if any files changed**

If verification produced edits, run:

```bash
rtk git status --short
rtk git add apps/server/src/agent-os apps/web/src/app/\\(automation\\)/agents apps/web/src/lib/query-keys.ts
rtk git commit -m "fix: stabilize agent office hq"
```

Expected: commit succeeds when there are staged verification fixes. If `git status --short` is empty, skip the commit command.

## Self-Review Notes

Spec coverage:

- Virtual office replacement is covered by Tasks 4-6.
- Hermes/Paperclip benchmark is covered by Tasks 1-3 through session resume, parsed metadata, and persisted thread handles.
- KidItem boundary constraints are covered by Global Constraints and by using existing Agent OS APIs and MCP allowlists.
- Current screen deletion is covered by Task 6 replacing `page.tsx`.
- Verification gates are covered by Task 7.

Placeholder scan:

- This plan avoids undefined task names, undefined method names, and deferred implementation language.
- Every new interface is defined before use.
- Each task has a runnable test command and expected result.

Type consistency:

- Backend runtime metadata flows from `HermesOperatorRuntimeResult` to `AgentRuntimeResult`.
- Session metadata uses the existing `runtimeThreadId` key already validated by `AgentOsInstanceSessionRepository`.
- Frontend API methods return shared Agent OS DTO types imported from `@kiditem/shared/agent-os`.
