import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import { HermesRuntimeProfileService } from '../hermes-runtime-profile.service';

const fsMock = vi.hoisted(() => ({
  chmod: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => fsMock);

const originalEnv = { ...process.env };

const baseInput = {
  organizationId: 'org-1',
  conversationId: 'conversation-1',
  requestId: 'request-1',
  runId: null,
  agentInstanceId: 'agent-instance-1',
  agentType: 'manager',
  taskSessionId: 'task-session-1',
  requestedByUserId: 'user-1',
};

type PrepareInput = typeof baseInput;

interface PreparedProfile {
  hermesHome: string;
  configPath: string;
  toolsets: string[];
  env: Record<string, string>;
}

function serviceWithPrepare() {
  return new HermesRuntimeProfileService() as unknown as {
    prepare(input: PrepareInput): Promise<PreparedProfile>;
  };
}

function writtenConfig(): string {
  const [, configText] = fsMock.writeFile.mock.calls.at(-1) ?? [];
  expect(typeof configText).toBe('string');
  return configText as string;
}

describe('HermesRuntimeProfileService', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.AGENT_OS_HERMES_ENABLE_KIDITEM_MCP;
    fsMock.mkdir.mockReset();
    fsMock.rename.mockReset();
    fsMock.chmod.mockReset();
    fsMock.copyFile.mockReset();
    fsMock.rm.mockReset();
    fsMock.writeFile.mockReset();
  });

  it('resolves HERMES_HOME from AGENT_OS_HERMES_HOME and writes a KidItem MCP config disabled by default', async () => {
    process.env.AGENT_OS_HERMES_HOME = '/tmp/custom hermes';
    process.env.OPENAI_API_KEY = 'sk-openai-secret';
    process.env.ANTHROPIC_API_KEY = 'sk-anthropic-secret';
    const service = serviceWithPrepare();

    const profile = await service.prepare(baseInput);

    expect(profile).toEqual({
      hermesHome: '/tmp/custom hermes/org-org-1/session-task-session-1',
      configPath:
        '/tmp/custom hermes/org-org-1/session-task-session-1/config.yaml',
      toolsets: ['skills'],
      env: {
        HERMES_HOME: '/tmp/custom hermes/org-org-1/session-task-session-1',
        KIDITEM_AGENT_OS_ORGANIZATION_ID: 'org-1',
        KIDITEM_AGENT_OS_CONVERSATION_ID: 'conversation-1',
        KIDITEM_AGENT_OS_TASK_SESSION_ID: 'task-session-1',
        KIDITEM_AGENT_OS_REQUEST_ID: 'request-1',
        KIDITEM_AGENT_OS_RUN_ID: '',
        KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: 'agent-instance-1',
        KIDITEM_AGENT_OS_AGENT_TYPE: 'manager',
        KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: 'user-1',
      },
    });
    expect(fsMock.mkdir).toHaveBeenCalledWith(profile.hermesHome, {
      recursive: true,
    });
    const config = writtenConfig();
    expect(config).toContain('mcp_servers:');
    expect(config).toContain('  kiditem-agent-os:');
    expect(config).toContain('    command: "node"');
    expect(config).toMatch(
      /      - ".*agent-os\/adapter\/in\/mcp\/kiditem-agent-os-mcp-server\.js"/,
    );
    expect(config).toContain('    env:');
    expect(config).toContain('      KIDITEM_AGENT_OS_ORGANIZATION_ID: "org-1"');
    expect(config).toContain(
      '      KIDITEM_AGENT_OS_CONVERSATION_ID: "conversation-1"',
    );
    expect(config).toContain(
      '      KIDITEM_AGENT_OS_TASK_SESSION_ID: "task-session-1"',
    );
    expect(config).toContain('      KIDITEM_AGENT_OS_REQUEST_ID: "request-1"');
    expect(config).toContain('      KIDITEM_AGENT_OS_RUN_ID: ""');
    expect(config).toContain(
      '      KIDITEM_AGENT_OS_AGENT_INSTANCE_ID: "agent-instance-1"',
    );
    expect(config).toContain('      KIDITEM_AGENT_OS_AGENT_TYPE: "manager"');
    expect(config).toContain(
      '      KIDITEM_AGENT_OS_REQUESTED_BY_USER_ID: "user-1"',
    );
    expect(config).toContain('    enabled: false');
    expect(config).toContain('        - "agent_os_read_context"');
    expect(config).toContain('        - "agent_os_create_task"');
    expect(config).not.toContain('sourcing_scrape_url');
    expect(config).not.toContain('listing_create_generation_package');
    expect(config).not.toContain('kiditem_capability_invoke');
    expect(config).not.toContain('OPENAI_API_KEY');
    expect(config).not.toContain('ANTHROPIC_API_KEY');
    expect(config).not.toContain('sk-openai-secret');
    expect(config).not.toContain('sk-anthropic-secret');
    expect(config).not.toContain('npm');
    expect(fsMock.copyFile).not.toHaveBeenCalled();
  });

  it('copies a configured Hermes auth store into the task-session profile', async () => {
    process.env.AGENT_OS_HERMES_HOME = '/tmp/custom-hermes';
    process.env.AGENT_OS_HERMES_AUTH_HOME = '/Users/test/.hermes-service';
    const service = serviceWithPrepare();

    const profile = await service.prepare(baseInput);

    expect(fsMock.copyFile).toHaveBeenCalledWith(
      '/Users/test/.hermes-service/auth.json',
      `${profile.hermesHome}/auth.json.tmp`,
    );
    expect(fsMock.chmod).toHaveBeenCalledWith(
      `${profile.hermesHome}/auth.json.tmp`,
      0o600,
    );
    expect(fsMock.rename).toHaveBeenCalledWith(
      `${profile.hermesHome}/auth.json.tmp`,
      `${profile.hermesHome}/auth.json`,
    );
  });

  it('fails closed when the configured Hermes auth store cannot be copied', async () => {
    process.env.AGENT_OS_HERMES_AUTH_HOME = '/Users/test/.hermes-missing';
    fsMock.copyFile.mockRejectedValueOnce(new Error('ENOENT'));
    const service = serviceWithPrepare();

    await expect(service.prepare(baseInput)).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_auth_home_unavailable',
        'Hermes runtime auth home is configured but auth.json could not be copied.',
      ),
    );
    expect(fsMock.rm).toHaveBeenCalledWith(
      '/tmp/kiditem-agent-os-hermes/org-org-1/session-task-session-1/auth.json.tmp',
      { force: true },
    );
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it('adds the KidItem MCP toolset and enables its config only when explicitly enabled', async () => {
    process.env.AGENT_OS_HERMES_ENABLE_KIDITEM_MCP = 'true';
    const service = serviceWithPrepare();

    const profile = await service.prepare(baseInput);

    expect(profile.toolsets).toEqual(['kiditem-agent-os']);
    expect(writtenConfig()).toContain('    enabled: true');
  });

  it('can force-enable KidItem MCP for Hermes tool-loop sessions', async () => {
    const service = serviceWithPrepare();

    const profile = await service.prepare({
      ...baseInput,
      enableKidItemMcp: true,
    });

    expect(profile.toolsets).toEqual(['kiditem-agent-os']);
    expect(writtenConfig()).toContain('    enabled: true');
  });

  it('writes only safe Hermes control env into the KidItem MCP server config', async () => {
    process.env.AGENT_OS_OPERATOR_RUNTIME = 'hermes_tool_loop';
    process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES = 'sourcing,listing';
    process.env.AGENT_OS_HERMES_PROVIDER = 'openai-codex';
    process.env.AGENT_OS_HERMES_MODEL = 'gpt-5.5';
    process.env.AGENT_OS_HERMES_PATH = '/opt/homebrew/bin/hermes';
    process.env.AGENT_OS_HERMES_HOME = '/tmp/kiditem-hermes';
    process.env.AGENT_OS_HERMES_AUTH_HOME = '/Users/test/.hermes';
    process.env.AGENT_OS_HERMES_TIMEOUT_MS = '180000';
    process.env.AGENT_OS_HERMES_MAX_OUTPUT_BYTES = '524288';
    process.env.AGENT_OS_HERMES_MAX_CONCURRENT_RUNS = '1';
    process.env.DATABASE_URL = 'postgresql://user:secret@db/kiditem';
    process.env.S3_SECRET_KEY = 's3-secret';
    process.env.GEMINI_API_KEY = 'gemini-secret';
    const service = serviceWithPrepare();

    await service.prepare({
      ...baseInput,
      enableKidItemMcp: true,
    });

    const config = writtenConfig();
    expect(config).toContain(
      '      AGENT_OS_OPERATOR_RUNTIME: "hermes_tool_loop"',
    );
    expect(config).toContain(
      '      AGENT_OS_HERMES_LEAF_AGENT_TYPES: "sourcing,listing"',
    );
    expect(config).toContain(
      '      AGENT_OS_HERMES_PROVIDER: "openai-codex"',
    );
    expect(config).toContain('      AGENT_OS_HERMES_MODEL: "gpt-5.5"');
    expect(config).toContain(
      '      AGENT_OS_HERMES_PATH: "/opt/homebrew/bin/hermes"',
    );
    expect(config).toContain(
      '      AGENT_OS_HERMES_HOME: "/tmp/kiditem-hermes"',
    );
    expect(config).toContain(
      '      AGENT_OS_HERMES_AUTH_HOME: "/tmp/kiditem-hermes/org-org-1/session-task-session-1"',
    );
    expect(config).toContain('      AGENT_OS_HERMES_TIMEOUT_MS: "180000"');
    expect(config).toContain(
      '      AGENT_OS_HERMES_MAX_OUTPUT_BYTES: "524288"',
    );
    expect(config).toContain(
      '      AGENT_OS_HERMES_MAX_CONCURRENT_RUNS: "1"',
    );
    expect(config).not.toContain('/Users/test/.hermes');
    expect(config).not.toContain('DATABASE_URL');
    expect(config).not.toContain('S3_SECRET_KEY');
    expect(config).not.toContain('GEMINI_API_KEY');
    expect(config).not.toContain('secret');
  });

  it('writes only manifest-allowed leaf tools for a listing Hermes profile', async () => {
    const service = serviceWithPrepare();

    await service.prepare({
      ...baseInput,
      agentType: 'listing',
      enableKidItemMcp: true,
    });

    const config = writtenConfig();
    expect(config).toContain('        - "agent_os_read_context"');
    expect(config).toContain('        - "agent_os_finalize_task"');
    expect(config).toContain('        - "listing_create_generation_package"');
    expect(config).toContain('        - "listing_submit_wing_thumbnail"');
    expect(config).not.toContain('agent_os_create_task');
    expect(config).not.toContain('sourcing_scrape_url');
  });

  it('falls back to the local-dev Hermes home when AGENT_OS_HERMES_HOME is unset', async () => {
    delete process.env.AGENT_OS_HERMES_HOME;
    const service = serviceWithPrepare();

    const profile = await service.prepare(baseInput);

    expect(profile.hermesHome).toBe(
      '/tmp/kiditem-agent-os-hermes/org-org-1/session-task-session-1',
    );
    expect(profile.configPath).toBe(
      '/tmp/kiditem-agent-os-hermes/org-org-1/session-task-session-1/config.yaml',
    );
  });

  it('writes the same stdio-safe KidItem MCP command when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const service = serviceWithPrepare();

    await service.prepare(baseInput);

    expect(writtenConfig()).toMatch(
      /      - ".*agent-os\/adapter\/in\/mcp\/kiditem-agent-os-mcp-server\.js"/,
    );
    expect(writtenConfig()).not.toContain('agent-os:mcp:kiditem');
  });

  it('creates task-session scoped profile directories for concurrent Operator turns', async () => {
    const service = serviceWithPrepare();

    const first = await service.prepare({
      ...baseInput,
      taskSessionId: 'task-session-1',
    });
    const second = await service.prepare({
      ...baseInput,
      requestId: 'request-2',
      taskSessionId: 'task-session-2',
    });

    expect(first.configPath).toContain('/session-task-session-1/config.yaml');
    expect(second.configPath).toContain('/session-task-session-2/config.yaml');
    expect(first.configPath).not.toBe(second.configPath);
  });

  it.each([
    ['organizationId with parent traversal', { organizationId: '../escape' }],
    ['organizationId parent segment', { organizationId: '..' }],
    ['taskSessionId with nested path', { taskSessionId: 'nested/session' }],
    ['taskSessionId with backslash separator', { taskSessionId: 'nested\\session' }],
    ['empty organizationId', { organizationId: '   ' }],
  ])('rejects unsafe profile path segments: %s', async (_caseName, override) => {
    process.env.AGENT_OS_HERMES_HOME = '/tmp/hermes-safe-base';
    const service = serviceWithPrepare();

    await expect(
      service.prepare({
        ...baseInput,
        ...override,
      }),
    ).rejects.toEqual(
      new AgentOsRuntimeError(
        'operator_runtime_invalid_profile_path',
        'Hermes runtime profile path segment is invalid.',
      ),
    );
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
    expect(fsMock.rename).not.toHaveBeenCalled();
  });

  it('writes config through a temporary file and atomically renames it into place', async () => {
    const service = serviceWithPrepare();

    const profile = await service.prepare(baseInput);

    expect(fsMock.writeFile).toHaveBeenCalledWith(
      `${profile.configPath}.tmp`,
      expect.any(String),
      'utf8',
    );
    expect(fsMock.rename).toHaveBeenCalledWith(
      `${profile.configPath}.tmp`,
      profile.configPath,
    );
    expect(fsMock.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      fsMock.rename.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
