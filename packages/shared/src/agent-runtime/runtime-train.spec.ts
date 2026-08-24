import { describe, expect, it } from 'vitest';
import {
  AgentCliRuntimeSchema,
  ATTEMPT_RUNTIME_TRAIN,
  RunnerPlatformSchema,
  attemptRuntimeVersion,
  runnerPlatformFromNodePlatform,
} from './runtime-train';

describe('native Agent runtime train', () => {
  it('freezes the approved control, CLI, MCP, and Node identities', () => {
    expect(ATTEMPT_RUNTIME_TRAIN).toEqual({
      controlRevision: 'kiditem-runner-control-v1',
      cliContractIdentity: 'office-cli-contract-v2',
      mcpProtocolRevision: '2026-07-28',
      codexVersion: '0.149.1',
      claudeVersion: '2.1.241',
      nodeMajor: 22,
    });
    expect(Object.isFrozen(ATTEMPT_RUNTIME_TRAIN)).toBe(true);
  });

  it.each([
    ['codex_cli', '0.149.1'],
    ['claude_cli', '2.1.241'],
  ] as const)('returns the approved version for %s', (runtime, expected) => {
    expect(attemptRuntimeVersion(runtime)).toBe(expected);
  });

  it('accepts only the supported Runner platforms and CLI runtimes', () => {
    expect(RunnerPlatformSchema.options).toEqual(['macos', 'windows']);
    expect(AgentCliRuntimeSchema.options).toEqual(['codex_cli', 'claude_cli']);
  });

  it.each([
    ['linux'],
    ['freebsd'],
  ])('rejects unsupported Node platform %s without a fallback', (platform) => {
    expect(runnerPlatformFromNodePlatform('darwin')).toBe('macos');
    expect(runnerPlatformFromNodePlatform('win32')).toBe('windows');
    expect(() => runnerPlatformFromNodePlatform(platform)).toThrow(
      'runner_platform_unsupported',
    );
  });
});
