import { describe, expect, it, vi } from "vitest";
import {
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatOperationRunName,
  OperationRunIdSchema,
  OrganizationIdSchema,
} from "@kiditem/shared/identifiers";
import {
  AGENT_OS_OPERATIONS,
  AgentSessionTaskOperationInputSchema,
} from "../../../../domain/operation/agent-os.operations";
import { AgentSessionTaskExecutionService } from "../agent-session-task-execution.service";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID = "00000000-0000-4000-8000-000000000002";
const EXECUTION_ID = "00000000-0000-4000-8000-000000000003";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000004";
const ARTIFACT_ID = "00000000-0000-4000-8000-000000000005";
const ORGANIZATION_ID = "org-1";
const SESSION_NAME = formatAgentSessionName(
  OrganizationIdSchema.parse(ORGANIZATION_ID),
  AgentSessionIdSchema.parse(SESSION_ID),
);
const TASK_NAME = formatAgentSessionTaskName(
  OrganizationIdSchema.parse(ORGANIZATION_ID),
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentSessionTaskIdSchema.parse(TASK_ID),
);
const EXECUTION_NAME = formatAgentExecutionName(
  OrganizationIdSchema.parse(ORGANIZATION_ID),
  AgentSessionIdSchema.parse(SESSION_ID),
  AgentExecutionIdSchema.parse(EXECUTION_ID),
);

const handle = {
  runtimeType: "hermes_http",
  executionId: EXECUTION_ID,
  attemptId: ATTEMPT_ID,
  externalRunId: "external-1",
  encryptedHandleRef: "vault://handle-1",
  generation: 1,
};
const runtimeHandleCheckpoint = {
  runtimeType: handle.runtimeType,
  executionId: handle.executionId,
  attemptId: handle.attemptId,
  externalRunId: handle.externalRunId,
  encryptedHandleRef: handle.encryptedHandleRef,
  generation: handle.generation,
};
const executionContext = {
  organizationId: ORGANIZATION_ID,
  sessionId: SESSION_ID,
  sessionTaskId: TASK_ID,
  executionId: EXECUTION_ID,
  attemptId: ATTEMPT_ID,
  agentDefinitionKey: "operator",
  agentVersionId: "version-1",
  runtimeType: "hermes_http",
  modelIdentity: "gpt-test",
  capabilityKeys: [],
  policySnapshotId: "policy-1",
  promptPackage: {},
  conversationView: { throughSequence: "1", summary: null, turns: [] },
  currentInput: {},
  currentResourceRefs: [],
};
const operation = {
  runId: "operation-1",
  organizationId: ORGANIZATION_ID,
  operationKey: "agent-os.execute-session-task",
  triggerSource: "agent" as const,
  input: { session: SESSION_NAME, task: TASK_NAME, execution: EXECUTION_NAME },
  requestedByUserId: null,
  scheduleId: null,
  parentRunId: null,
  attemptToken: "attempt-token-1",
  signal: new AbortController().signal,
  checkpoint: vi.fn(),
};

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function harness(
  options: {
    checkpoint?: Record<string, unknown>;
    inspection?: Record<string, unknown>;
    events?: Array<Record<string, unknown>>;
  } = {},
) {
  const order: string[] = [];
  const runtime = {
    runtimeType: "hermes_http",
    capabilities: {
      detached: true,
      reconnect: true,
      interrupt: true,
      cancel: true,
      inspect: true,
    },
    start: vi.fn(async () => {
      order.push("start");
      return handle;
    }),
    connect: vi.fn(async function* () {
      order.push("connect");
      for (const event of options.events ?? [
        { kind: "terminal", status: "completed", output: { ok: true } },
      ])
        yield event as never;
    }),
    inspect: vi
      .fn()
      .mockResolvedValue(options.inspection ?? { status: "running" }),
    interrupt: vi.fn(),
    cancel: vi.fn(),
  };
  const checkpoints = {
    findLatest: vi.fn().mockResolvedValue(options.checkpoint ?? null),
    append: vi.fn(async (input) => {
      order.push(`checkpoint:${input.kind}`);
      return {
        ...input,
        id: "checkpoint",
        sequence: 1n,
        createdAt: new Date(),
      };
    }),
  };
  const controls = {
    startAttempt: vi
      .fn()
      .mockResolvedValue({
        id: ATTEMPT_ID,
        executionId: EXECUTION_ID,
        attemptNumber: 1,
        runtimeType: "hermes_http",
        state: "running",
      }),
    activateAttemptForOperation: vi
      .fn()
      .mockResolvedValue({
        id: ATTEMPT_ID,
        executionId: EXECUTION_ID,
        attemptNumber: 1,
        runtimeType: "hermes_http",
        state: "running",
      }),
    findAttemptForOperation: vi.fn().mockResolvedValue({
      id: ATTEMPT_ID,
      executionId: EXECUTION_ID,
      attemptNumber: 1,
      runtimeType: "hermes_http",
      externalRunId: null,
      encryptedHandleRef: null,
      runtimeGeneration: 0,
      operationRunId: operation.runId,
      state: "running",
    }),
    persistAttemptHandle: vi.fn(async () => {
      order.push("persist-handle");
      return { id: ATTEMPT_ID };
    }),
    finishAttempt: vi.fn(async () => {
      order.push("finish-attempt");
      return { id: ATTEMPT_ID };
    }),
    findTask: vi.fn().mockResolvedValue({ id: "task-1", status: "running" }),
    transitionTask: vi
      .fn()
      .mockResolvedValue({ id: "task-1", status: "completed" }),
  };
  const artifacts = {
    materialize: vi.fn().mockResolvedValue({
      kind: "artifact",
      artifactId: ARTIFACT_ID,
      payload: {
        artifactType: "report",
        label: "검증 보고서",
        sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
        navigationActionId: "00000000-0000-4000-8000-000000000006",
      },
    }),
    beginFence: vi.fn(),
    confirmFenced: vi.fn(),
  };
  const executions = {
    loadExecutionRuntimeContext: vi.fn().mockResolvedValue({
      organizationId: "org-1",
      sessionId: SESSION_ID,
      sessionTaskId: TASK_ID,
      executionId: EXECUTION_ID,
      runtimeType: "hermes_http",
    }),
    findCurrentExecution: vi.fn().mockResolvedValue({ status: "running" }),
    markExecutionTerminal: vi.fn(),
  };
  const runtimeControl = {
    record: vi.fn(async () => {
      order.push("runtime-event");
      return { event: { id: "event-1", sequence: 2n }, pointer: {} };
    }),
    publish: vi.fn(),
  };
  const approvals = { request: vi.fn() };
  const operations = {
    findRunById: vi.fn().mockResolvedValue({ input: operation.input }),
  };
  const operationExecution = {
    findOperation: vi.fn().mockResolvedValue({ input: operation.input }),
    findLatestCheckpoint: checkpoints.findLatest,
    appendCheckpoint: checkpoints.append,
  };
  const executionService = new AgentSessionTaskExecutionService(
    { build: vi.fn().mockResolvedValue(executionContext) } as never,
    { requireCompatible: vi.fn().mockReturnValue(runtime) } as never,
    operationExecution as never,
    controls as never,
    controls as never,
    controls as never,
    artifacts as never,
    runtimeControl as never,
    approvals as never,
    executions as never,
    executions as never,
  );
  const handler = {
    execute: async (context = operation) => {
      const result = await executionService.execute({
        organizationId: context.organizationId,
        session: context.input.session,
        task: context.input.task,
        execution: context.input.execution,
        operation: formatOperationRunName(
          OrganizationIdSchema.parse(context.organizationId),
          OperationRunIdSchema.parse(context.runId),
        ),
        operationAttemptToken: context.attemptToken,
        requestedByUserId: context.requestedByUserId,
        signal: context.signal,
      });
      if (result.status === "completed")
        return { kind: "completed", result: result.output };
      if (result.status === "attention_required")
        return {
          kind: "attention_required",
          reason: result.reason,
          result: result.output,
        };
      if (result.status === "cancelled")
        return { kind: "cancelled", result: result.output };
      return { kind: "failed", code: result.code, message: result.message };
    },
    cancel: (context: typeof operation & { reason: string | null }) =>
      executionService.cancel({
        organizationId: context.organizationId,
        operation: formatOperationRunName(
          OrganizationIdSchema.parse(context.organizationId),
          OperationRunIdSchema.parse(context.runId),
        ),
        requestedByUserId: context.requestedByUserId,
        reason: context.reason,
      }),
  };
  return {
    handler,
    runtime,
    checkpoints,
    controls,
    artifacts,
    runtimeControl,
    approvals,
    executions,
    operations,
    order,
  };
}

describe("AgentSessionTaskExecutionService", () => {
  it("registers a finite API-owned Operations resource policy", () => {
    expect(AGENT_OS_OPERATIONS[0]).toMatchObject({
      resourceClass: "default",
      executionTimeoutMs: 60 * 60_000,
    });
  });

  it("requires canonical operation resource names with one matching session parent", () => {
    expect(AgentSessionTaskOperationInputSchema.parse(operation.input)).toEqual(
      operation.input,
    );
    expect(() =>
      AgentSessionTaskOperationInputSchema.parse({
        ...operation.input,
        task: formatAgentSessionTaskName(
          OrganizationIdSchema.parse(ORGANIZATION_ID),
          AgentSessionIdSchema.parse("00000000-0000-4000-8000-000000000099"),
          AgentSessionTaskIdSchema.parse(TASK_ID),
        ),
      }),
    ).toThrow();
  });

  it("persists a new opaque handle before consuming runtime events", async () => {
    const { handler, runtime, order } = harness();
    await expect(handler.execute(operation)).resolves.toEqual({
      kind: "completed",
      result: {
        executionId: EXECUTION_ID,
        taskId: TASK_ID,
        status: "completed",
      },
    });
    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(order.indexOf("persist-handle")).toBeLessThan(
      order.indexOf("connect"),
    );
    expect(order.indexOf("checkpoint:runtime_handle_persisted")).toBeLessThan(
      order.indexOf("connect"),
    );
  });

  it("inspects, re-persists, and reconnects a checkpointed handle on lease reclaim without starting again", async () => {
    const { handler, runtime, controls, order } = harness({
      checkpoint: {
        id: "checkpoint-1",
        organizationId: "org-1",
        operationRunId: "operation-1",
        sequence: 3n,
        kind: "runtime_handle_persisted",
        state: { runtimeHandle: runtimeHandleCheckpoint },
        createdAt: new Date(),
      },
    });
    await handler.execute(operation);
    expect(runtime.inspect).toHaveBeenCalledWith(handle);
    expect(runtime.start).not.toHaveBeenCalled();
    expect(controls.persistAttemptHandle).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: EXECUTION_ID,
        externalRunId: "external-1",
        encryptedHandleRef: "vault://handle-1",
      }),
    );
    expect(order.indexOf("persist-handle")).toBeLessThan(
      order.indexOf("connect"),
    );
    expect(runtime.connect).toHaveBeenCalledWith(handle);
  });

  it("fails a lost persisted handle instead of starting a replacement", async () => {
    const { handler, runtime } = harness({
      checkpoint: {
        id: "checkpoint-1",
        organizationId: "org-1",
        operationRunId: "operation-1",
        sequence: 3n,
        kind: "runtime_handle_persisted",
        state: { runtimeHandle: runtimeHandleCheckpoint },
        createdAt: new Date(),
      },
      inspection: { status: "unknown" },
    });
    await expect(handler.execute(operation)).resolves.toMatchObject({
      kind: "failed",
      code: "AGENT_RUNTIME_HANDLE_LOST",
    });
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it("checkpoints only an allowlisted encrypted handle reference and never adapter secrets", async () => {
    const { handler, checkpoints } = harness();
    await handler.execute(operation);

    const serialized = JSON.stringify(checkpoints.append.mock.calls);
    expect(serialized).toContain("encryptedHandleRef");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("runtimeConfig");
    expect(serialized).not.toContain("promptPackage");
  });

  it("reconciles a terminal checkpoint after a worker crash without reopening the task or runtime", async () => {
    const { handler, runtime, controls } = harness({
      checkpoint: {
        id: "checkpoint-terminal",
        organizationId: "org-1",
        operationRunId: "operation-1",
        sequence: 9n,
        kind: "terminal",
        state: {
          runtimeHandle: runtimeHandleCheckpoint,
          status: "completed",
          errorCode: null,
        },
        createdAt: new Date(),
      },
    });

    await expect(handler.execute(operation)).resolves.toEqual({
      kind: "completed",
      result: {
        executionId: EXECUTION_ID,
        taskId: TASK_ID,
        status: "completed",
      },
    });
    expect(controls.activateAttemptForOperation).not.toHaveBeenCalled();
    expect(runtime.start).not.toHaveBeenCalled();
    expect(runtime.inspect).not.toHaveBeenCalled();
  });

  it("persists canonical text, progress, and terminal events before terminal state reconciliation", async () => {
    const { handler, runtimeControl, order } = harness({
      events: [
        { kind: "text_delta", content: "근거를 " },
        { kind: "progress", progress: 0.5, label: "검증 중" },
        { kind: "text_delta", content: "확인했습니다." },
        { kind: "terminal", status: "completed", output: { ok: true } },
      ],
    });

    await expect(handler.execute(operation)).resolves.toMatchObject({
      kind: "completed",
    });

    expect(
      runtimeControl.record.mock.calls.map(([input]) => input.event.kind),
    ).toEqual([
      "text_start",
      "text_delta",
      "progress",
      "text_delta",
      "text_end",
      "terminal",
    ]);
    expect(order.lastIndexOf("runtime-event")).toBeLessThan(
      order.indexOf("finish-attempt"),
    );
  });

  it("preserves explicit runtime text boundaries without synthesizing a duplicate start", async () => {
    const { handler, runtimeControl } = harness({
      events: [
        { kind: "text_start" },
        { kind: "text_delta", content: "명시적 경계 " },
        { kind: "text_end" },
        { kind: "terminal", status: "completed", output: { ok: true } },
      ],
    });

    await expect(handler.execute(operation)).resolves.toMatchObject({
      kind: "completed",
    });

    expect(
      runtimeControl.record.mock.calls.map(([input]) => input.event.kind),
    ).toEqual(["text_start", "text_delta", "text_end", "terminal"]);
  });

  it("persists approval state and both conversation events before checkpointing and publishing the interrupt", async () => {
    const { handler, approvals, runtimeControl, checkpoints, controls, order } =
      harness({
        events: [
          {
            kind: "interrupt",
            interruptId: "interrupt-1",
            payload: {
              capabilityKey: "supply.submitPurchaseOrder",
              arguments: { purchaseOrderId: "po-1" },
              summary: "발주서를 제출합니다.",
              resourceVersions: [],
              expiresAt: "2030-01-01T00:00:00.000Z",
            },
          },
        ],
      });
    approvals.request.mockImplementation(async () => {
      order.push("approval-persist");
      return {
        approvalId: "00000000-0000-4000-8000-000000000005",
        persistedEvents: [
          { pointer: { eventId: "approval-card" } },
          { pointer: { eventId: "approval-interrupt" } },
        ],
      };
    });
    runtimeControl.publish.mockImplementation(async () => {
      order.push("approval-publish");
    });

    await expect(handler.execute(operation)).resolves.toEqual({
      kind: "attention_required",
      reason: "agent_session_approval_required",
      result: { approvalId: "00000000-0000-4000-8000-000000000005" },
    });

    expect(approvals.request).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        session: SESSION_NAME,
        task: TASK_NAME,
        execution: EXECUTION_NAME,
        attempt: expect.stringContaining(`/attempts/${ATTEMPT_ID}`),
      }),
    );
    expect(controls.transitionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedState: "running",
        state: "waiting_approval",
      }),
    );
    expect(checkpoints.append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "interrupt_boundary",
      }),
    );
    expect(order.indexOf("approval-persist")).toBeLessThan(
      order.findIndex((entry) => entry === "checkpoint:interrupt_boundary"),
    );
    expect(
      order.findIndex((entry) => entry === "checkpoint:interrupt_boundary"),
    ).toBeLessThan(order.indexOf("approval-publish"));
  });

  it("materializes a bounded artifact candidate before emitting its registered durable card", async () => {
    const { handler, artifacts, runtimeControl } = harness({
      events: [
        {
          kind: "artifact_candidate",
          externalArtifactId: "provider-artifact-1",
          artifactType: "report",
          label: "검증 보고서",
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "application/octet-stream",
          sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
          navigationActionId: "00000000-0000-4000-8000-000000000006",
          metadata: { source: "runtime" },
        },
        { kind: "terminal", status: "completed", output: { ok: true } },
      ],
    });

    await expect(handler.execute(operation)).resolves.toMatchObject({
      kind: "completed",
    });

    expect(artifacts.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sessionId: SESSION_ID,
        taskId: TASK_ID,
        executionId: EXECUTION_ID,
        operationRunId: operation.runId,
        attemptToken: operation.attemptToken,
        externalArtifactId: "provider-artifact-1",
      }),
    );
    expect(runtimeControl.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          kind: "artifact",
          artifactId: ARTIFACT_ID,
        }),
      }),
    );
  });

  it("cancels the exact checkpointed runtime and reconciles canonical terminal state", async () => {
    const {
      handler,
      runtime,
      controls,
      executions,
      runtimeControl,
      checkpoints,
    } = harness({
      checkpoint: {
        id: "checkpoint-handle",
        organizationId: ORGANIZATION_ID,
        operationRunId: operation.runId,
        sequence: 3n,
        kind: "runtime_handle_persisted",
        state: { runtimeHandle: runtimeHandleCheckpoint },
        createdAt: new Date(),
      },
    });

    await handler.cancel({
      runId: operation.runId,
      organizationId: ORGANIZATION_ID,
      operationKey: operation.operationKey,
      requestedByUserId: "user-1",
      reason: "operator_cancelled",
    });

    expect(runtime.cancel).toHaveBeenCalledWith(handle);
    expect(runtimeControl.record).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        event: { kind: "terminal", status: "cancelled" },
      }),
    );
    expect(controls.finishAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        state: "cancelled",
      }),
    );
    expect(executions.markExecutionTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EXECUTION_ID,
        status: "cancelled",
      }),
    );
    expect(controls.transitionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        state: "cancelled",
      }),
    );
    expect(checkpoints.append).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "terminal" }),
    );
  });

  it("cancels a queued reserved attempt without inventing a runtime handle", async () => {
    const { handler, runtime, controls, runtimeControl, checkpoints } =
      harness();
    controls.findAttemptForOperation.mockResolvedValue({
      id: ATTEMPT_ID,
      executionId: EXECUTION_ID,
      attemptNumber: 1,
      runtimeType: "hermes_http",
      externalRunId: null,
      encryptedHandleRef: null,
      runtimeGeneration: 0,
      operationRunId: operation.runId,
      state: "queued",
    });

    await handler.cancel({
      runId: operation.runId,
      organizationId: ORGANIZATION_ID,
      operationKey: operation.operationKey,
      requestedByUserId: "user-1",
      reason: "cancelled_before_claim",
    });

    expect(runtime.cancel).not.toHaveBeenCalled();
    expect(controls.finishAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        expectedState: "queued",
        state: "cancelled",
      }),
    );
    expect(runtimeControl.record).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        event: { kind: "terminal", status: "cancelled" },
      }),
    );
    expect(checkpoints.append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "terminal",
        state: expect.objectContaining({
          runtimeHandle: null,
          status: "cancelled",
        }),
      }),
    );
  });

  it("cancels the exact durable runtime and terminalizes the canonical graph when an idle stream hits its deadline", async () => {
    const { handler, runtime, controls, executions, runtimeControl } =
      harness();
    runtime.connect.mockImplementation(async function* () {
      await never<void>();
    });
    const controller = new AbortController();
    const running = handler.execute({
      ...operation,
      signal: controller.signal,
      checkpoint: vi.fn(),
    });

    await vi.waitFor(() =>
      expect(runtime.connect).toHaveBeenCalledWith(handle),
    );
    controller.abort(new Error("operation_deadline_exceeded"));

    await expect(running).rejects.toThrow("operation_deadline_exceeded");
    expect(runtime.cancel).toHaveBeenCalledWith(handle);
    expect(runtimeControl.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          kind: "terminal",
          status: "failed",
          errorCode: "OPERATION_DEADLINE_EXCEEDED",
        },
      }),
    );
    expect(controls.finishAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        state: "failed",
        errorCode: "OPERATION_DEADLINE_EXCEEDED",
      }),
    );
    expect(executions.markExecutionTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EXECUTION_ID,
        status: "failed",
        errorCode: "OPERATION_DEADLINE_EXCEEDED",
      }),
    );
    expect(controls.transitionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        state: "failed",
      }),
    );
  }, 250);

  it("terminalizes the canonical graph when an exact deadline cancel rejects", async () => {
    const { handler, runtime, controls, executions, runtimeControl } =
      harness();
    runtime.connect.mockImplementation(async function* () {
      await never<void>();
    });
    runtime.cancel.mockRejectedValueOnce(new Error("runtime_cancel_rejected"));
    const controller = new AbortController();
    const running = handler.execute({
      ...operation,
      signal: controller.signal,
      checkpoint: vi.fn(),
    });

    await vi.waitFor(() =>
      expect(runtime.connect).toHaveBeenCalledWith(handle),
    );
    controller.abort(new Error("operation_deadline_exceeded"));

    await expect(running).rejects.toThrow("operation_deadline_exceeded");
    expect(controls.finishAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        state: "failed",
        errorCode: "OPERATION_DEADLINE_EXCEEDED",
      }),
    );
    expect(executions.markExecutionTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EXECUTION_ID,
        status: "failed",
      }),
    );
    expect(runtimeControl.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          kind: "terminal",
          status: "failed",
          errorCode: "OPERATION_DEADLINE_EXCEEDED",
        },
      }),
    );
  });

  it("bounds an exact deadline cancel that never resolves and rejects late success", async () => {
    const { handler, runtime, controls, executions, runtimeControl } =
      harness();
    const lateTerminal = deferred<void>();
    runtime.connect.mockImplementation(async function* () {
      await lateTerminal.promise;
      yield { kind: "terminal", status: "completed", output: { late: true } };
    });
    runtime.cancel.mockImplementation(() => never<void>());
    const controller = new AbortController();
    const running = handler.execute({
      ...operation,
      signal: controller.signal,
      checkpoint: vi.fn(),
    });

    await vi.waitFor(() =>
      expect(runtime.connect).toHaveBeenCalledWith(handle),
    );
    controller.abort(new Error("operation_deadline_exceeded"));

    await expect(
      Promise.race([
        running.then(
          () => "resolved",
          (error: unknown) =>
            error instanceof Error ? error.message : String(error),
        ),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("timed_out"), 350),
        ),
      ]),
    ).resolves.toBe("operation_deadline_exceeded");
    lateTerminal.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(controls.finishAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        state: "failed",
        errorCode: "OPERATION_DEADLINE_EXCEEDED",
      }),
    );
    expect(executions.markExecutionTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EXECUTION_ID,
        status: "failed",
      }),
    );
    expect(runtimeControl.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          kind: "terminal",
          status: "completed",
        }),
      }),
    );
  }, 500);

  it.each(["operation_server_shutdown", "operation_attempt_fence_lost"])(
    "stops %s stream consumption without cancelling the durable runtime or accepting a late success",
    async (reason) => {
      const { handler, runtime, controls, executions, runtimeControl } =
        harness();
      const lateTerminal = deferred<void>();
      runtime.connect.mockImplementation(async function* () {
        await lateTerminal.promise;
        yield { kind: "terminal", status: "completed", output: { late: true } };
      });
      const controller = new AbortController();
      const running = handler.execute({
        ...operation,
        signal: controller.signal,
        checkpoint: vi.fn(),
      });

      await vi.waitFor(() =>
        expect(runtime.connect).toHaveBeenCalledWith(handle),
      );
      controller.abort(new Error(reason));

      await expect(running).rejects.toThrow(reason);
      lateTerminal.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(runtime.cancel).not.toHaveBeenCalled();
      expect(controls.finishAttempt).not.toHaveBeenCalled();
      expect(executions.markExecutionTerminal).not.toHaveBeenCalled();
      expect(runtimeControl.record).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: "terminal",
            status: "completed",
          }),
        }),
      );
    },
    250,
  );
});
