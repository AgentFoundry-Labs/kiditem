import { describe, expect, it } from 'vitest';
import {
  buildClaudeCommand,
  buildCodexCommand,
  filterLocalCliEnvironment,
  type BuildAgentLocalCliCommandInput,
} from '../agent-local-cli-command';
import { resolveAgentLocalCliRuntimeConfig } from '../../../../application/service/agent-runtime.config';

function commandInput(): BuildAgentLocalCliCommandInput {
  return {
    provider: 'codex_cli',
    model: 'gpt-5.6-sol',
    workingDirectory: '/tmp/agent-run',
    hostEnvironment: {
      PATH: '/usr/bin',
      HOME: '/Users/operator',
      CODEX_HOME: '/Users/operator/.codex',
      OPENAI_API_KEY: 'operator-supplied',
      DATABASE_URL: 'postgres://secret',
      REDIS_URL: 'redis://secret',
      COUPANG_ACCESS_KEY: 'commerce-secret',
      SOURCING_ASSISTANT_RUNTIME: 'codex',
    },
    prompt: '추천 근거를 설명해줘',
    outputSchema: { type: 'object' },
    outputSchemaFile: '/tmp/agent-run/output.schema.json',
    outputFile: '/tmp/agent-run/output.json',
    claudeMcpConfigFile: '/tmp/agent-run/mcp.json',
    codexMcpConfigOverrides: [
      'mcp_servers.kiditem.command="node"',
      'mcp_servers.kiditem.args=["server.js"]',
    ],
    allowedMcpToolNames: [
      'agent_os_read_context',
      'sourcing_retrieve_workspace_evidence',
    ],
    claudeMaxBudgetUsd: '0.25',
  };
}

describe('agent local CLI command builders', () => {
  it('builds an isolated Claude command with one strict MCP server and stdin prompt', () => {
    const input = { ...commandInput(), provider: 'claude_cli' as const };
    const command = buildClaudeCommand(input);

    expect(command.args).toEqual(
      expect.arrayContaining([
        '--print',
        '--setting-sources',
        '',
        '--tools',
        '',
        '--allowedTools',
        'mcp__kiditem__agent_os_read_context,mcp__kiditem__sourcing_retrieve_workspace_evidence',
        '--strict-mcp-config',
        '--mcp-config',
        input.claudeMcpConfigFile,
        '--no-chrome',
        '--no-session-persistence',
        '--disable-slash-commands',
        '--json-schema',
        JSON.stringify(input.outputSchema),
        '--max-budget-usd',
        input.claudeMaxBudgetUsd,
        '--model',
        input.model,
      ]),
    );
    expect(command).toMatchObject({ stdin: input.prompt });
    expect(command.args).not.toContain(input.prompt);
    expect(command.args).not.toContain('--bare');
    expect(command.env).not.toHaveProperty('DATABASE_URL');
    expect(command.env).not.toHaveProperty('REDIS_URL');
    expect(command.env).not.toHaveProperty('COUPANG_ACCESS_KEY');
    expect(command.env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('builds an isolated Codex command with stdin prompt and all execution surfaces disabled', () => {
    const input = commandInput();
    const command = buildCodexCommand(input);

    expect(command.args).toEqual(
      expect.arrayContaining([
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '--strict-config',
        '--skip-git-repo-check',
        '--cd',
        input.workingDirectory,
        '--sandbox',
        'read-only',
        '--disable',
        'shell_tool',
        '--disable',
        'unified_exec',
        '--disable',
        'browser_use',
        '--disable',
        'computer_use',
        '--disable',
        'plugins',
        '--disable',
        'image_generation',
        '--output-schema',
        input.outputSchemaFile,
        '--output-last-message',
        input.outputFile,
        '--json',
        '--model',
        input.model,
        '-',
      ]),
    );
    for (const feature of [
      'browser_use_external',
      'browser_use_full_cdp_access',
      'apps',
      'multi_agent',
      'workspace_dependencies',
      'code_mode',
      'in_app_browser',
      'view_image',
    ]) {
      expect(command.args).toEqual(expect.arrayContaining(['--disable', feature]));
    }
    expect(command.args).toEqual(
      expect.arrayContaining([
        '--config',
        'approval_policy="never"',
        '--config',
        'allow_login_shell=false',
        '--config',
        'tools.web_search=false',
        '--config',
        'web_search="disabled"',
      ]),
    );
    expect(command.args).not.toContain('tools.view_image=false');
    expect(command.args).not.toEqual(
      expect.arrayContaining(['--disable', 'code_mode_host']),
    );
    expect(command.env).not.toHaveProperty('DATABASE_URL');
    expect(command.stdin).toBe(input.prompt);
    expect(command.args).not.toContain(input.prompt);
    expect(command.args.join(' ')).not.toContain('SOURCING_ASSISTANT');
    expect(command.args.filter((value) => value.startsWith('mcp_servers.'))).toEqual(
      input.codexMcpConfigOverrides,
    );
  });

  it('forwards only the selected providers local authentication environment', () => {
    const host = commandInput().hostEnvironment;
    expect(filterLocalCliEnvironment('claude_cli', host)).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/Users/operator',
    });
    expect(filterLocalCliEnvironment('claude_cli', host)).not.toHaveProperty(
      'OPENAI_API_KEY',
    );
    expect(filterLocalCliEnvironment('codex_cli', host)).toMatchObject({
      CODEX_HOME: '/Users/operator/.codex',
      OPENAI_API_KEY: 'operator-supplied',
    });
  });

  it('uses bounded runtime defaults and finite-positive tuning fallbacks', () => {
    expect(resolveAgentLocalCliRuntimeConfig({})).toEqual({
      executionTimeoutMs: 45_000,
      stdoutLimitBytes: 524_288,
      stderrLimitBytes: 32_768,
      outputFileLimitBytes: 65_536,
      concurrency: 2,
      capacityWaitMs: 5_000,
      claudeMaxBudgetUsd: '0.25',
    });
    expect(
      resolveAgentLocalCliRuntimeConfig({
        AGENT_RUNTIME_EXECUTION_TIMEOUT_MS: 'NaN',
        AGENT_RUNTIME_CONCURRENCY: '-2',
      }),
    ).toMatchObject({ executionTimeoutMs: 45_000, concurrency: 2 });
  });
});
