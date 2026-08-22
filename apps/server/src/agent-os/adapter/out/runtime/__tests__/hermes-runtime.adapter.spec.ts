import { describe, expect, it, vi } from "vitest";
import type { AgentDurableRuntimeExecutionContext } from "../../../../application/port/out/runtime/agent-durable-runtime.port";
import {
  HermesFetchRuntimeTransport,
  HermesHttpRuntimeAdapter,
  hermesFetchRuntimeTransportFromEnvironment,
  normalizeHermesProviderItem,
  type HermesRuntimeTransport,
} from "../hermes-http-runtime.adapter";
import {
  RuntimeCredentialBroker,
  runtimeCredentialBrokerFromEnvironment,
} from "../runtime-credential-broker";
import { buildRunScopedMcpConfig } from "../run-scoped-mcp-config";
import { HermesAcpRuntimeAdapter } from "../hermes-acp-runtime.adapter";

const EXECUTION_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";

function context(): AgentDurableRuntimeExecutionContext {
  return {
    organizationId: "33333333-3333-4333-8333-333333333333",
    sessionId: "44444444-4444-4444-8444-444444444444",
    sessionTaskId: "55555555-5555-4555-8555-555555555555",
    executionId: EXECUTION_ID,
    attemptId: ATTEMPT_ID,
    startIntentId: "88888888-8888-4888-8888-888888888888",
    runtimeCredentialGeneration: 0,
    agentDefinitionKey: "operator",
    agentVersionId: "66666666-6666-4666-8666-666666666666",
    runtimeType: "hermes_http",
    modelIdentity: "model-1",
    capabilityKeys: ["analytics.readOverview"],
    policySnapshotId: "77777777-7777-4777-8777-777777777777",
    promptPackage: {
      prompt: "prompt",
      promptSha256: "a".repeat(64),
      summaryPrompt: "summary",
      summaryPromptSha256: "b".repeat(64),
      skills: [],
      outputSchema: null,
    },
    conversationView: { throughSequence: "1", summary: null, turns: [] },
    currentInput: {},
    currentResourceRefs: [],
  };
}

function transport(): HermesRuntimeTransport {
  return {
    start: vi.fn().mockResolvedValue({
      externalRunId: "hermes-1",
      reconnectSecret: "secret-1",
      generation: 4,
    }),
    connect: vi.fn().mockReturnValue(
      (async function* () {
        yield { type: "progress", progress: 0.5, label: "working" };
        yield { type: "terminal", status: "completed", output: { ok: true } };
      })(),
    ),
    inspect: vi.fn().mockResolvedValue({ status: "running" }),
    interrupt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    inspectStartIntent: vi.fn().mockResolvedValue({ status: "running" }),
    cancelStartIntent: vi.fn().mockResolvedValue(undefined),
    revokeStartIntent: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Hermes durable runtime trust boundary", () => {
  it("requires an explicit bounded runtime credential configuration", () => {
    expect(() => runtimeCredentialBrokerFromEnvironment({})).toThrow(
      "AGENT_RUNTIME_CREDENTIAL_HMAC_KEY_REQUIRED",
    );
    expect(() =>
      runtimeCredentialBrokerFromEnvironment({
        AGENT_RUNTIME_CREDENTIAL_HMAC_KEY:
          "test-secret-at-least-32-characters-long",
        AGENT_RUNTIME_CREDENTIAL_TTL_MS: "900001",
      }),
    ).toThrow("RUNTIME_CREDENTIAL_TTL_INVALID");
    expect(
      runtimeCredentialBrokerFromEnvironment({
        AGENT_RUNTIME_CREDENTIAL_HMAC_KEY:
          "test-secret-at-least-32-characters-long",
        AGENT_RUNTIME_CREDENTIAL_TTL_MS: "60000",
      }).issue({
        organizationId: "33333333-3333-4333-8333-333333333333",
        sessionId: "44444444-4444-4444-8444-444444444444",
        executionId: EXECUTION_ID,
        attemptId: ATTEMPT_ID,
        startIntentId: "88888888-8888-4888-8888-888888888888",
        runtimeCredentialGeneration: 0,
      }).token,
    ).toBeTruthy();
  });

  it("requires an explicit Hermes control-plane base URL", () => {
    expect(() => hermesFetchRuntimeTransportFromEnvironment({})).toThrow(
      "HERMES_RUNTIME_BASE_URL_REQUIRED",
    );
    expect(() =>
      hermesFetchRuntimeTransportFromEnvironment({
        HERMES_RUNTIME_BASE_URL: "not-a-url",
      }),
    ).toThrow("HERMES_RUNTIME_BASE_URL_INVALID");
    expect(
      () =>
        new HermesFetchRuntimeTransport({
          baseUrl: "http://hermes.example/control",
        }),
    ).toThrow("HERMES_RUNTIME_BASE_URL_INSECURE");
    expect(
      () =>
        new HermesFetchRuntimeTransport({
          baseUrl: "http://127.0.0.1:4311/control",
        }),
    ).not.toThrow();
  });

  it("issues attempt-scoped expiring credentials and exact registered MCP tools", () => {
    let now = new Date("2026-08-14T00:00:00.000Z");
    const broker = new RuntimeCredentialBroker({
      secret: "test-secret-at-least-32-characters-long",
      ttlMs: 1_000,
      now: () => now,
    });
    const issued = broker.issue({
      organizationId: "33333333-3333-4333-8333-333333333333",
      sessionId: "44444444-4444-4444-8444-444444444444",
      executionId: EXECUTION_ID,
      attemptId: ATTEMPT_ID,
      startIntentId: "88888888-8888-4888-8888-888888888888",
      runtimeCredentialGeneration: 0,
    });
    expect(broker.verify(issued.token)).toMatchObject({
      executionId: EXECUTION_ID,
      attemptId: ATTEMPT_ID,
      runtimeCredentialGeneration: 0,
    });
    expect(() =>
      broker.verify(issued.token, {
        executionId: EXECUTION_ID,
        attemptId: "other",
      } as never),
    ).toThrow("RUNTIME_CREDENTIAL_SCOPE_INVALID");
    now = new Date("2026-08-14T00:00:02.000Z");
    expect(() => broker.verify(issued.token)).toThrow(
      "RUNTIME_CREDENTIAL_EXPIRED",
    );

    expect(
      buildRunScopedMcpConfig({
        capabilityKeys: ["analytics.readOverview"],
        registeredTools: new Map([
          [
            "analytics.readOverview",
            { serverKey: "kiditem", toolName: "analytics_read_overview" },
          ],
          [
            "supply.submit",
            { serverKey: "kiditem", toolName: "supply_submit" },
          ],
        ]),
        credential: "opaque",
      }),
    ).toEqual({
      schemaVersion: 1,
      servers: [
        {
          key: "kiditem",
          credential: "opaque",
          tools: ["analytics_read_overview"],
        },
      ],
    });
    expect(() =>
      buildRunScopedMcpConfig({
        capabilityKeys: ["unknown.tool"],
        registeredTools: new Map(),
        credential: "opaque",
      }),
    ).toThrow("RUNTIME_CAPABILITY_NOT_REGISTERED");
  });

  it("uses the explicit Hermes control-plane contract without forwarding raw authority", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            externalRunId: "hermes-1",
            reconnectSecret: "secret-1",
            generation: 4,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          [
            JSON.stringify({
              type: "progress",
              progress: 0.5,
              label: "working",
            }),
            JSON.stringify({
              type: "terminal",
              status: "completed",
              output: { ok: true },
            }),
          ].join("\n"),
          { status: 200, headers: { "content-type": "application/x-ndjson" } },
        ),
      );
    const transport = new HermesFetchRuntimeTransport({
      baseUrl: "https://hermes.example/control/",
      fetch: fetcher,
    });
    const started = await transport.start({
      context: context(),
      mcpConfig: {
        schemaVersion: 1,
        servers: [
          {
            key: "kiditem",
            credential: "attempt-token",
            tools: ["analytics_read_overview"],
          },
        ],
      },
      credentialExpiresAt: "2026-08-14T00:05:00.000Z",
    });
    const [url, request] = fetcher.mock.calls[0];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;

    expect(url).toBe("https://hermes.example/control/runs");
    expect(started).toEqual({
      externalRunId: "hermes-1",
      reconnectSecret: "secret-1",
      generation: 4,
    });
    expect(body).toMatchObject({
      schemaVersion: 1,
      execution: expect.objectContaining({
        id: EXECUTION_ID,
        attemptId: ATTEMPT_ID,
        modelIdentity: "model-1",
      }),
      mcpConfig: expect.objectContaining({
        servers: [
          expect.objectContaining({ tools: ["analytics_read_overview"] }),
        ],
      }),
    });
    expect(body).not.toHaveProperty("organizationId");
    expect(JSON.stringify(body)).not.toContain(
      "77777777-7777-4777-8777-777777777777",
    );

    const events = [];
    for await (const event of transport.connect({
      externalRunId: "hermes-1",
      reconnectSecret: "secret-1",
      generation: 4,
    }))
      events.push(event);
    expect(events).toEqual([
      { type: "progress", progress: 0.5, label: "working" },
      { type: "terminal", status: "completed", output: { ok: true } },
    ]);
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://hermes.example/control/runs/hermes-1/events?generation=4",
    );
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({
      "x-hermes-reconnect-secret": "secret-1",
    });
  });

  it("starts, reconnects after adapter recreation, inspects, interrupts and idempotently cancels", async () => {
    const fake = transport();
    const cipher = {
      encrypt: vi.fn(() => "vault://reconnect/1"),
      decrypt: vi.fn(() => "secret-1"),
    };
    const broker = new RuntimeCredentialBroker({
      secret: "test-secret-at-least-32-characters-long",
    });
    const adapter = new HermesHttpRuntimeAdapter({
      transport: fake,
      credentialBroker: broker,
      handleCipher: cipher,
      toolRegistry: new Map([
        [
          "analytics.readOverview",
          { serverKey: "kiditem", toolName: "analytics_read_overview" },
        ],
      ]),
    });
    const handle = await adapter.start(context());
    expect(handle).toMatchObject({
      runtimeType: "hermes_http",
      executionId: EXECUTION_ID,
      attemptId: ATTEMPT_ID,
      externalRunId: "hermes-1",
      encryptedHandleRef: "vault://reconnect/1",
      generation: 4,
    });
    expect(fake.start).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          executionId: EXECUTION_ID,
          attemptId: ATTEMPT_ID,
        }),
        mcpConfig: expect.objectContaining({
          servers: [
            expect.objectContaining({ tools: ["analytics_read_overview"] }),
          ],
        }),
      }),
    );

    const recreated = new HermesHttpRuntimeAdapter({
      transport: fake,
      credentialBroker: broker,
      handleCipher: cipher,
      toolRegistry: new Map([
        [
          "analytics.readOverview",
          { serverKey: "kiditem", toolName: "analytics_read_overview" },
        ],
      ]),
    });
    expect(await recreated.inspect(handle)).toEqual({ status: "running" });
    const events = [];
    for await (const event of recreated.connect(handle)) events.push(event);
    expect(events).toEqual([
      { kind: "progress", progress: 0.5, label: "working" },
      { kind: "terminal", status: "completed", output: { ok: true } },
    ]);
    await recreated.interrupt(handle, {
      interruptId: "approval-1",
      payload: { decision: "approved" },
    });
    await Promise.all([recreated.cancel(handle), recreated.cancel(handle)]);
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(handle)).not.toContain("secret-1");
  });

  it.each([true, false])(
    "cleans the exact persisted start intent even when handle is %s",
    async (withHandle) => {
      const fake = transport();
      vi.mocked(fake.inspectStartIntent)
        .mockResolvedValueOnce({ status: "running" })
        .mockResolvedValueOnce({ status: "cancelled" });
      const adapter = new HermesHttpRuntimeAdapter({
        transport: fake,
        credentialBroker: new RuntimeCredentialBroker({
          secret: "test-secret-at-least-32-characters-long",
        }),
        handleCipher: {
          encrypt: () => "vault://reconnect/1",
          decrypt: () => "secret-1",
        },
        toolRegistry: new Map([
          [
            "analytics.readOverview",
            { serverKey: "kiditem", toolName: "analytics_read_overview" },
          ],
        ]),
      });
      const handle = withHandle ? await adapter.start(context()) : null;

      await expect(
        adapter.cleanup({
          signal: new AbortController().signal,
          organizationId: context().organizationId,
          sessionId: context().sessionId,
          deletionOperationRunId: "99999999-9999-4999-8999-999999999991",
          deletionAttemptToken: "deletion-attempt-token",
          runtimeType: "hermes_http",
          executionId: EXECUTION_ID,
          attemptId: ATTEMPT_ID,
          startIntentId: context().startIntentId,
          handle,
        }),
      ).resolves.toEqual({
        state: "clean",
        executionAuthority: "irrevocably_revoked",
        credentials: "irrevocably_revoked",
        handle: "removed",
        filesystem: "not_owned",
      });
      const exact = {
        organizationId: context().organizationId,
        sessionId: context().sessionId,
        executionId: EXECUTION_ID,
        attemptId: ATTEMPT_ID,
        startIntentId: context().startIntentId,
      };
      expect(fake.inspectStartIntent).toHaveBeenLastCalledWith(exact);
      expect(fake.cancelStartIntent).toHaveBeenCalledWith(exact);
      expect(fake.revokeStartIntent).toHaveBeenCalledWith(exact);
    },
  );

  it("rejects inline artifact bytes and accepts only canonical resource references", () => {
    expect(() =>
      normalizeHermesProviderItem({
      type: "artifact_candidate",
      externalArtifactId: "provider-artifact-1",
      artifactType: "report",
      label: "Result report",
      contentBase64: "AQID",
      mimeType: "application/octet-stream",
      sha256:
        "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      navigationActionId: "00000000-0000-4000-8000-000000000006",
      metadata: { source: "hermes" },
      } as never),
    ).toThrow('agent_session_runtime_inline_artifact_unsupported');

    expect(normalizeHermesProviderItem({
      type: 'resource_ref',
      resource: { kind: 'report', id: 'resource-1', version: null },
    })).toEqual({
      kind: 'resource_ref',
      resource: { kind: 'report', id: 'resource-1', version: null },
    });
  });

  it("rejects authority-expanding runtime options", () => {
    const fake = transport();
    const common = {
      transport: fake,
      credentialBroker: new RuntimeCredentialBroker({
        secret: "test-secret-at-least-32-characters-long",
      }),
      handleCipher: {
        encrypt: (value: string) => value,
        decrypt: (value: string) => value,
      },
      toolRegistry: new Map<string, { serverKey: string; toolName: string }>(),
    };
    for (const unsafeOptions of [
      { args: ["--yolo"] },
      { args: ["--permission-mode=bypass"] },
      { executablePath: "/tmp/hermes" },
      { configHome: "/shared/home" },
      { inlineMcpServers: [{}] },
      { hooks: ["echo unsafe"] },
    ]) {
      expect(
        () =>
          new HermesHttpRuntimeAdapter({ ...common, unsafeOptions } as never),
      ).toThrow("HERMES_RUNTIME_OPTIONS_FORBIDDEN");
    }
  });

  it("registers ACP only when every durable interactive semantic is compatible", () => {
    const common = {
      transport: transport(),
      credentialBroker: new RuntimeCredentialBroker({
        secret: "test-secret-at-least-32-characters-long",
      }),
      handleCipher: {
        encrypt: (value: string) => value,
        decrypt: (value: string) => value,
      },
      toolRegistry: new Map<string, { serverKey: string; toolName: string }>(),
    };
    expect(
      new HermesAcpRuntimeAdapter({
        ...common,
        compatibility: {
          detached: true,
          reconnect: true,
          interrupt: true,
          cancel: true,
          inspect: true,
        },
      }).runtimeType,
    ).toBe("hermes_acp");
    expect(
      () =>
        new HermesAcpRuntimeAdapter({
          ...common,
          compatibility: {
            detached: true,
            reconnect: false,
            interrupt: true,
            cancel: true,
            inspect: true,
          },
        } as never),
    ).toThrow("HERMES_ACP_INCOMPATIBLE");
  });
});
