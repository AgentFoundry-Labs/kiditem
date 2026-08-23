import { describe, expect, it, vi } from "vitest";
import type { AgentDurableRuntimeExecutionContext } from "../../../../application/port/out/runtime/agent-durable-runtime.port";
import {
  IsolatedCliRuntimeAdapter,
  isolatedCliRunRootFromEnvironment,
  type IsolatedCliFilesystem,
  type IsolatedCliTransport,
} from "../isolated-cli-runtime.adapter";
import { CodexCliRuntimeAdapter } from "../codex-cli-runtime.adapter";
import { ClaudeCliRuntimeAdapter } from "../claude-cli-runtime.adapter";

const EXECUTION_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";

function context(
  attemptId = ATTEMPT_ID,
  runtimeType = "codex_cli",
): AgentDurableRuntimeExecutionContext {
  return {
    organizationId: "33333333-3333-4333-8333-333333333333",
    sessionId: "44444444-4444-4444-8444-444444444444",
    sessionTaskId: "55555555-5555-4555-8555-555555555555",
    executionId: EXECUTION_ID,
    attemptId,
    startIntentId: "88888888-8888-4888-8888-888888888888",
    runtimeCredentialGeneration: 0,
    agentDefinitionKey: "operator",
    agentVersionId: "66666666-6666-4666-8666-666666666666",
    runtimeType,
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

function memoryFs(): IsolatedCliFilesystem & {
  writes: Map<string, { value: string; mode?: number }>;
  directories: Array<{ path: string; mode: number }>;
  chmod: ReturnType<typeof vi.fn>;
} {
  const writes = new Map<string, { value: string; mode?: number }>();
  const directories: Array<{ path: string; mode: number }> = [];
  return {
    writes,
    directories,
    mkdir: vi.fn(async (path, options) => {
      directories.push({ path, mode: options.mode });
    }),
    writeFile: vi.fn(async (path, value, options) => {
      writes.set(path, { value, mode: options.mode });
    }),
    chmod: vi.fn(async () => undefined),
    removeTree: vi.fn(async () => undefined),
    exists: vi.fn().mockResolvedValue(false),
  };
}

function transport(version = "codex-cli 1.2.3"): IsolatedCliTransport {
  return {
    probeVersion: vi.fn().mockResolvedValue(version),
    probeAuthentication: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue({
      nativeSessionId: "native-session-1",
      pid: 42,
      processStartIdentity: "proc-start-42",
      generation: 2,
    }),
    connect: vi.fn().mockReturnValue(
      (async function* () {
        yield {
          kind: "terminal",
          status: "completed" as const,
          output: { ok: true },
        };
      })(),
    ),
    inspect: vi.fn().mockResolvedValue({ status: "running" }),
    interrupt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    readProcessStartIdentity: vi.fn().mockResolvedValue("proc-start-42"),
    superviseStartIntent: vi.fn().mockResolvedValue(undefined),
    inspectStartIntent: vi.fn().mockResolvedValue({ status: "running" }),
    cancelStartIntent: vi.fn().mockResolvedValue(undefined),
    revokeStartIntent: vi.fn().mockResolvedValue(undefined),
  };
}

describe("isolated CLI durable runtime", () => {
  it.each(["codex_cli", "claude_cli"])(
    "persists and cleans only the exact supervised %s start intent after recreation",
    async (runtimeType) => {
      const fs = memoryFs();
      vi.mocked(fs.exists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const cli = transport(
        runtimeType === "claude_cli" ? "claude 2.3.4" : "codex-cli 1.2.3",
      );
      vi.mocked(cli.inspectStartIntent)
        .mockResolvedValueOnce({ status: "running" })
        .mockResolvedValueOnce({ status: "cancelled" });
      const common = {
        filesystem: fs,
        transport: cli,
        runRoot: "/tmp/runs",
        ambientEnv: { PATH: "/bin" },
        handleCipher: { encrypt: () => "vault://cli/1", decrypt: () => "" },
        mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
      };
      const adapter =
        runtimeType === "claude_cli"
          ? new ClaudeCliRuntimeAdapter(common)
          : new CodexCliRuntimeAdapter(common);
      await adapter.assertReady();
      await adapter.start(context(ATTEMPT_ID, runtimeType));
      expect(cli.superviseStartIntent).toHaveBeenCalledBefore(
        cli.start as never,
      );

      const recreated =
        runtimeType === "claude_cli"
          ? new ClaudeCliRuntimeAdapter(common)
          : new CodexCliRuntimeAdapter(common);
      await expect(
        recreated.cleanup({
          signal: new AbortController().signal,
          organizationId: context().organizationId,
          sessionId: context().sessionId,
          deletionOperationRunId: "99999999-9999-4999-8999-999999999991",
          deletionAttemptToken: "deletion-attempt-token",
          runtimeType,
          executionId: EXECUTION_ID,
          attemptId: ATTEMPT_ID,
          startIntentId: context().startIntentId,
          handle: null,
        }),
      ).resolves.toEqual({
        state: "clean",
        executionAuthority: "process_exited",
        credentials: "not_owned",
        handle: "removed",
        filesystem: "removed",
      });
      const exact = {
        organizationId: context().organizationId,
        sessionId: context().sessionId,
        executionId: EXECUTION_ID,
        attemptId: ATTEMPT_ID,
        startIntentId: context().startIntentId,
      };
      expect(cli.cancelStartIntent).toHaveBeenCalledWith(exact);
      expect(cli.revokeStartIntent).toHaveBeenCalledWith(exact);
      expect(fs.removeTree).toHaveBeenCalledWith({
        executionId: EXECUTION_ID,
        attemptId: ATTEMPT_ID,
      });
      expect(fs.exists).toHaveBeenLastCalledWith({
        executionId: EXECUTION_ID,
        attemptId: ATTEMPT_ID,
      });
    },
  );
  it("creates attempt-isolated work/state and uses local CLI login without ambient credentials", async () => {
    const fs = memoryFs();
    const cli = transport();
    const originalHome = process.env.HOME;
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: fs,
      transport: cli,
      runRoot: "/var/lib/kiditem-agent-runs",
      handleCipher: {
        encrypt: () => "vault://cli/1",
        decrypt: () => "resume-1",
      },
      mcpConfig: () => ({ schemaVersion: 1, servers: [] }),
      ambientEnv: {
        PATH: "/bin",
        LANG: "ko_KR.UTF-8",
        HOME: "/operator",
        USER: "service-account",
        DATABASE_URL: "postgres://secret",
        AWS_SECRET_ACCESS_KEY: "cloud-secret",
        OPENAI_API_KEY: "model-secret",
        ANTHROPIC_API_KEY: "model-secret-2",
      },
    });
    await adapter.assertReady();
    const handle = await adapter.start(context());
    expect(cli.start).toHaveBeenCalledWith(
      expect.objectContaining({
        binary: "codex",
        cwd: `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/work`,
        env: expect.objectContaining({
          HOME: "/operator",
          KIDITEM_MCP_CONFIG:
            `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/state/mcp.json`,
        }),
      }),
    );
    const childEnv = vi.mocked(cli.start).mock.calls[0][0].env;
    expect(childEnv).toHaveProperty("USER", "service-account");
    expect(childEnv).not.toHaveProperty("DATABASE_URL");
    expect(childEnv).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(childEnv).not.toHaveProperty("OPENAI_API_KEY");
    expect(childEnv).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(process.env.HOME).toBe(originalHome);
    expect(fs.directories.every((entry) => entry.mode === 0o700)).toBe(true);
    expect(fs.chmod).toHaveBeenCalledWith(
      `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/work`,
      0o700,
    );
    expect(fs.chmod).toHaveBeenCalledWith(
      `/var/lib/kiditem-agent-runs/${EXECUTION_ID}/${ATTEMPT_ID}/state`,
      0o700,
    );
    expect([...fs.writes.values()].every((entry) => entry.mode === 0o600)).toBe(
      true,
    );
    expect(handle).toMatchObject({
      externalRunId: "native-session-1",
      encryptedHandleRef: "vault://cli/1",
      generation: 2,
    });

    await adapter.start(context("88888888-8888-4888-8888-888888888888"));
    expect(vi.mocked(cli.start).mock.calls[1][0].cwd).not.toBe(
      vi.mocked(cli.start).mock.calls[0][0].cwd,
    );
  });

  it("passes the exact judgment input, evidence, conversation, and skill contents to the local CLI", async () => {
    const cli = transport();
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: memoryFs(),
      transport: cli,
      runRoot: "/tmp/runs",
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      mcpConfig: () => ({ schemaVersion: 1, servers: [] }),
      ambientEnv: { PATH: "/bin", HOME: "/service-account" },
    });
    const exact = context();
    exact.promptPackage = {
      ...exact.promptPackage,
      prompt: "SYSTEM_PROMPT_SENTINEL",
      skills: [{
        key: "judgment.skill",
        version: "1.0.0",
        content: "SKILL_CONTENT_SENTINEL",
        sha256: "c".repeat(64),
      }],
    };
    exact.currentInput = {
      objective: "OBJECTIVE_SENTINEL",
      userEvent: {
        externalEventId: "event-1",
        schemaVersion: 1,
        payload: { content: "CURRENT_INPUT_SENTINEL" },
      },
    };
    exact.currentResourceRefs = [{
      kind: "product",
      id: "RESOURCE_SENTINEL",
      version: "7",
    }];
    exact.conversationView = {
      throughSequence: "4",
      summary: {
        sourceFromSequence: "1",
        sourceThroughSequence: "2",
        sourceHash: "d".repeat(64),
        summarizerModelIdentity: "summary-model",
        summaryPromptHash: "e".repeat(64),
        content: "SUMMARY_SENTINEL",
      },
      turns: [{
        role: "user",
        content: "TURN_SENTINEL",
        throughSequence: "4",
      }],
    };

    await adapter.assertReady();
    await adapter.start(exact);

    const prompt = vi.mocked(cli.start).mock.calls[0][0].prompt;
    for (const sentinel of [
      "SYSTEM_PROMPT_SENTINEL",
      "SKILL_CONTENT_SENTINEL",
      "OBJECTIVE_SENTINEL",
      "CURRENT_INPUT_SENTINEL",
      "RESOURCE_SENTINEL",
      "SUMMARY_SENTINEL",
      "TURN_SENTINEL",
    ]) expect(prompt).toContain(sentinel);
  });

  it("reconnects after recreation and rejects PID reuse before cancel", async () => {
    const fs = memoryFs();
    const cli = transport();
    const cipherValues = new Map([
      [
        "vault://cli/1",
        JSON.stringify({
          nativeSessionId: "native-session-1",
          pid: 42,
          processStartIdentity: "proc-start-42",
          executableVersion: "codex-cli 1.2.3",
          organizationId: "33333333-3333-4333-8333-333333333333",
          sessionId: "44444444-4444-4444-8444-444444444444",
          executionId: EXECUTION_ID,
          attemptId: ATTEMPT_ID,
          startIntentId: "88888888-8888-4888-8888-888888888888",
          runtimeCredentialGeneration: 0,
          modelIdentity: "model-1",
          outputSchema: null,
          claudeMaxBudgetUsd: null,
          mcpToolSet: { schemaVersion: 1, servers: [] },
        }),
      ],
    ]);
    const options = {
      filesystem: fs,
      transport: cli,
      runRoot: "/tmp/runs",
      ambientEnv: { PATH: "/bin" },
      handleCipher: {
        encrypt: vi.fn(() => "vault://cli/1"),
        decrypt: vi.fn((ref: string) => cipherValues.get(ref) ?? ""),
      },
      mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
    };
    const first = new CodexCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(context());
    const recreated = new CodexCliRuntimeAdapter(options);
    expect(await recreated.inspect(handle)).toEqual({ status: "running" });
    const events = [];
    for await (const event of recreated.connect(handle)) events.push(event);
    expect(events).toHaveLength(1);
    await recreated.cancel(handle);
    expect(cli.cancel).toHaveBeenCalledTimes(1);
    vi.mocked(cli.readProcessStartIdentity).mockResolvedValueOnce(
      "reused-pid-start",
    );
    await expect(
      recreated.cancel({ ...handle, generation: 3 }),
    ).rejects.toThrow("CLI_PROCESS_IDENTITY_MISMATCH");
    expect(cli.cancel).toHaveBeenCalledTimes(1);
  });

  it("re-probes the exact CLI version before a recreated adapter resumes a native session", async () => {
    const fs = memoryFs();
    const initialCli = transport("codex-cli 1.2.3");
    const cipherValues = new Map([
      [
        "vault://cli/1",
        JSON.stringify({
          nativeSessionId: "native-session-1",
          pid: 42,
          processStartIdentity: "proc-start-42",
          executableVersion: "codex-cli 1.2.3",
          organizationId: "33333333-3333-4333-8333-333333333333",
          sessionId: "44444444-4444-4444-8444-444444444444",
          executionId: EXECUTION_ID,
          attemptId: ATTEMPT_ID,
          startIntentId: "88888888-8888-4888-8888-888888888888",
          runtimeCredentialGeneration: 0,
          modelIdentity: "model-1",
          outputSchema: null,
          claudeMaxBudgetUsd: null,
          mcpToolSet: { schemaVersion: 1, servers: [] },
        }),
      ],
    ]);
    const options = {
      filesystem: fs,
      transport: initialCli,
      runRoot: "/tmp/runs",
      ambientEnv: { PATH: "/bin" },
      handleCipher: {
        encrypt: vi.fn(() => "vault://cli/1"),
        decrypt: vi.fn((ref: string) => cipherValues.get(ref) ?? ""),
      },
      mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
    };
    const first = new CodexCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(context());

    const upgradedCli = transport("codex-cli 1.2.4");
    const recreated = new CodexCliRuntimeAdapter({
      ...options,
      transport: upgradedCli,
    });
    await expect(recreated.inspect(handle)).rejects.toThrow(
      "CLI_RUNTIME_VERSION_CHANGED",
    );
    expect(upgradedCli.inspect).not.toHaveBeenCalled();
  });

  it("rewrites the exact DB-fenced execution context before native resume", async () => {
    const fs = memoryFs();
    const cli = transport();
    const cipherValues = new Map([
      [
        "vault://cli/1",
        JSON.stringify({
          nativeSessionId: "native-session-1",
          pid: 42,
          processStartIdentity: "proc-start-42",
          executableVersion: "codex-cli 1.2.3",
          organizationId: "33333333-3333-4333-8333-333333333333",
          sessionId: "44444444-4444-4444-8444-444444444444",
          executionId: EXECUTION_ID,
          attemptId: ATTEMPT_ID,
          startIntentId: "88888888-8888-4888-8888-888888888888",
          runtimeCredentialGeneration: 0,
          modelIdentity: "model-1",
          outputSchema: null,
          claudeMaxBudgetUsd: null,
          mcpToolSet: {
            schemaVersion: 1,
            servers: [{ key: "kiditem", tools: ["analytics_read_overview"] }],
          },
        }),
      ],
    ]);
    const options = {
      filesystem: fs,
      transport: cli,
      runRoot: "/tmp/runs",
      ambientEnv: { PATH: "/bin" },
      handleCipher: {
        encrypt: vi.fn(() => "vault://cli/1"),
        decrypt: vi.fn((ref: string) => cipherValues.get(ref) ?? ""),
      },
      mcpServer: {
        command: "/usr/bin/node",
        args: ["/app/dist/agent-os-mcp.js"],
        environmentRoot: "/app",
      },
      mcpConfig: () => ({
        schemaVersion: 1 as const,
        servers: [
          {
            key: "kiditem",
            tools: ["analytics_read_overview"],
          },
        ],
      }),
    };
    const first = new CodexCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(context());
    const directoriesBeforeReconnect = fs.directories.length;

    const recreated = new CodexCliRuntimeAdapter(options);
    for await (const _event of recreated.connect(handle)) {
      // Fully drain the reconnect stream so its setup runs.
    }

    expect(vi.mocked(cli.connect).mock.calls[0][1].env).not.toHaveProperty(
      "KIDITEM_RUNTIME_CREDENTIAL",
    );
    const resumeArgs = vi.mocked(cli.connect).mock.calls[0][1].args.join("\n");
    expect(resumeArgs).toContain("mcp_servers.kiditem.command");
    expect(resumeArgs).toContain("KIDITEM_MCP_EXECUTION_CONTEXT");
    expect(resumeArgs).not.toContain("KIDITEM_RUNTIME_CREDENTIAL");
    expect(resumeArgs).not.toContain("--output-schema");
    const nativeMcp = fs.writes.get(
      `/tmp/runs/${EXECUTION_ID}/${ATTEMPT_ID}/state/mcp.json`,
    );
    expect(nativeMcp?.mode).toBe(0o600);
    expect(nativeMcp?.value).toContain('[mcp_servers.kiditem]');
    expect(nativeMcp?.value).toContain('command = "/usr/bin/node"');
    expect(nativeMcp?.value).toContain(
      "KIDITEM_MCP_EXECUTION_CONTEXT",
    );
    expect(nativeMcp?.value).toContain(EXECUTION_ID);
    expect(fs.directories.slice(directoriesBeforeReconnect)).toContainEqual({
      path: `/tmp/runs/${EXECUTION_ID}/${ATTEMPT_ID}/state`,
      mode: 0o700,
    });
  });

  it("replays the exact Claude model, schema, and budget on native resume", async () => {
    const fs = memoryFs();
    const cli = transport("claude 2.3.4");
    const options = {
      filesystem: fs,
      transport: cli,
      runRoot: "/tmp/runs",
      ambientEnv: { PATH: "/bin" },
      handleCipher: {
        encrypt: (value: string) => value,
        decrypt: (value: string) => value,
      },
      claudeMaxBudgetUsd: "0.37",
      mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
    };
    const executionContext = {
      ...context(ATTEMPT_ID, "claude_cli"),
      modelIdentity: "claude-sonnet-exact",
      promptPackage: {
        ...context().promptPackage,
        outputSchema: {
          path: "agent-config/schemas/exact.json",
          version: "exact.v1",
          document: {
            type: "object",
            required: ["answer"],
            properties: { answer: { type: "string" } },
          },
          sha256: "c".repeat(64),
        },
      },
    };
    const first = new ClaudeCliRuntimeAdapter(options);
    await first.assertReady();
    const handle = await first.start(executionContext);

    const recreated = new ClaudeCliRuntimeAdapter(options);
    for await (const _event of recreated.connect(handle)) {
      // Drain the native resume stream.
    }

    const args = vi.mocked(cli.connect).mock.calls[0][1].args;
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-exact");
    expect(args).toContain("--json-schema");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1]!)).toEqual(
      executionContext.promptPackage.outputSchema.document,
    );
    expect(args).toContain("--max-budget-usd");
    expect(args[args.indexOf("--max-budget-usd") + 1]).toBe("0.37");
  });

  it("accepts only an absolute worker-owned run root and a strict generated MCP config", async () => {
    expect(isolatedCliRunRootFromEnvironment({})).toBe(
      "/var/lib/kiditem-agent-runs",
    );
    expect(() =>
      isolatedCliRunRootFromEnvironment({
        AGENT_DURABLE_RUNTIME_RUN_ROOT: "relative-runs",
      }),
    ).toThrow("CLI_RUNTIME_RUN_ROOT_INVALID");

    const fs = memoryFs();
    const cli = transport();
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: fs,
      transport: cli,
      runRoot: "/tmp/runs",
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      mcpConfig: () =>
        ({
          schemaVersion: 1,
          servers: [
            {
              key: "kiditem",
              tools: ["analytics_read_overview"],
              untrustedServerOption: "forbidden",
            },
          ],
        }) as never,
      ambientEnv: { PATH: "/bin" },
    });
    await adapter.assertReady();

    await expect(adapter.start(context())).rejects.toThrow();
    expect(cli.start).not.toHaveBeenCalled();
  });

  it("fails readiness for an incompatible exact CLI version without fallback", async () => {
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: memoryFs(),
      transport: transport("codex-cli 0.1.0"),
      runRoot: "/tmp/runs",
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      mcpConfig: () => ({ schemaVersion: 1, servers: [] }),
      ambientEnv: { PATH: "/bin" },
    });
    await expect(adapter.assertReady()).rejects.toThrow(
      "CLI_RUNTIME_VERSION_INCOMPATIBLE",
    );
    await expect(adapter.start(context())).rejects.toThrow(
      "CLI_RUNTIME_NOT_READY",
    );
  });

  it("requires the existing local CLI login without reading or forwarding provider credentials", async () => {
    const cli = transport();
    const probeAuthentication = vi.fn().mockResolvedValue(undefined);
    Object.assign(cli, { probeAuthentication });
    const adapter = new CodexCliRuntimeAdapter({
      filesystem: memoryFs(),
      transport: cli,
      runRoot: "/tmp/runs",
      handleCipher: { encrypt: (value) => value, decrypt: (value) => value },
      mcpConfig: () => ({ schemaVersion: 1, servers: [] }),
      ambientEnv: {
        PATH: "/bin",
        HOME: "/service-account",
        CODEX_HOME: "/service-account/.codex",
        OPENAI_API_KEY: "must-not-reach-auth-probe",
        ANTHROPIC_API_KEY: "must-not-reach-auth-probe",
      },
    });

    await adapter.assertReady();

    expect(probeAuthentication).toHaveBeenCalledWith("codex", {
      PATH: "/bin",
      HOME: "/service-account",
      CODEX_HOME: "/service-account/.codex",
    });
  });

  it("keeps Codex and Claude command/resume semantics exact and rejects unsafe binaries", () => {
    const common = {
      filesystem: memoryFs(),
      transport: transport(),
      runRoot: "/tmp/runs",
      handleCipher: {
        encrypt: (value: string) => value,
        decrypt: (value: string) => value,
      },
      mcpConfig: () => ({ schemaVersion: 1 as const, servers: [] }),
      ambientEnv: { PATH: "/bin" },
    };
    expect(new CodexCliRuntimeAdapter(common).command()).toEqual({
      binary: "codex",
      startArgs: [
        "exec",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--config",
        'sandbox_mode="read-only"',
        "--config",
        'approval_policy="never"',
        "--config",
        "shell_environment_policy.allow_login_shell=false",
        "--config",
        "tools.web_search=false",
        "--config",
        'web_search="disabled"',
        ...[
          "shell_tool",
          "unified_exec",
          "shell_snapshot",
          "browser_use",
          "browser_use_external",
          "browser_use_full_cdp_access",
          "computer_use",
          "plugins",
          "plugin_sharing",
          "remote_plugin",
          "apps",
          "image_generation",
          "multi_agent",
          "workspace_dependencies",
          "code_mode",
          "code_mode_host",
          "in_app_browser",
          "view_image",
          "skill_mcp_dependency_install",
          "tool_suggest",
          "request_permissions_tool",
          "auth_elicitation",
          "hooks",
        ].flatMap((feature) => ["--config", `features.${feature}=false`]),
        "--skip-git-repo-check",
        "--json",
      ],
      resumeArgs: [
        "exec",
        "resume",
        "--ignore-user-config",
        "--ignore-rules",
        "--strict-config",
        "--config",
        'sandbox_mode="read-only"',
        "--config",
        'approval_policy="never"',
        "--config",
        "shell_environment_policy.allow_login_shell=false",
        "--config",
        "tools.web_search=false",
        "--config",
        'web_search="disabled"',
        ...[
          "shell_tool",
          "unified_exec",
          "shell_snapshot",
          "browser_use",
          "browser_use_external",
          "browser_use_full_cdp_access",
          "computer_use",
          "plugins",
          "plugin_sharing",
          "remote_plugin",
          "apps",
          "image_generation",
          "multi_agent",
          "workspace_dependencies",
          "code_mode",
          "code_mode_host",
          "in_app_browser",
          "view_image",
          "skill_mcp_dependency_install",
          "tool_suggest",
          "request_permissions_tool",
          "auth_elicitation",
          "hooks",
        ].flatMap((feature) => ["--config", `features.${feature}=false`]),
        "--skip-git-repo-check",
        "--json",
      ],
    });
    expect(
      new ClaudeCliRuntimeAdapter({
        ...common,
        transport: transport("claude 2.3.4"),
      }).command(),
    ).toEqual({
      binary: "claude",
      startArgs: [
        "--print",
        "--verbose",
        "--output-format",
        "stream-json",
        "--setting-sources",
        "",
        "--tools",
        "",
        "--strict-mcp-config",
        "--no-chrome",
        "--permission-mode",
        "dontAsk",
        "--disable-slash-commands",
      ],
      resumeArgs: [
        "--resume",
        "--print",
        "--verbose",
        "--output-format",
        "stream-json",
        "--setting-sources",
        "",
        "--tools",
        "",
        "--strict-mcp-config",
        "--no-chrome",
        "--permission-mode",
        "dontAsk",
        "--disable-slash-commands",
      ],
    });
    expect(
      () =>
        new IsolatedCliRuntimeAdapter({
          ...common,
          runtimeType: "unsafe",
          binary: "/tmp/agent",
          allowedBinary: "codex",
          versionPattern: /^codex-cli 1\./,
          startArgs: [],
          resumeArgs: [],
        }),
    ).toThrow("CLI_RUNTIME_BINARY_NOT_ALLOWLISTED");
  });
});
