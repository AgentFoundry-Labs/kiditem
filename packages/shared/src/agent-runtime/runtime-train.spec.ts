import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATEWAY_RUNTIME_TRAIN,
  GatewayPlatformSchema,
  ProviderRuntimeSchema,
  gatewayPlatformFromNodePlatform,
  providerRuntimeVersion,
} from './runtime-train';

describe('native Agent runtime train', () => {
  it('freezes the approved Gateway control, CLI, MCP, and Node identities', () => {
    expect(GATEWAY_RUNTIME_TRAIN).toEqual({
      controlRevision: 'kiditem-gateway-control-v1',
      mcpProtocolRevision: '2026-07-28',
      codexVersion: '0.149.1',
      claudeVersion: '2.1.245',
      nodeMajor: 22,
    });
    expect(Object.isFrozen(GATEWAY_RUNTIME_TRAIN)).toBe(true);
  });

  it.each([
    ['codex_cli', '0.149.1'],
    ['claude_cli', '2.1.245'],
  ] as const)('returns the approved version for %s', (runtime, expected) => {
    expect(providerRuntimeVersion(runtime)).toBe(expected);
  });

  it('accepts only the supported Gateway platforms and provider runtimes', () => {
    expect(GatewayPlatformSchema.options).toEqual(['macos', 'windows']);
    expect(ProviderRuntimeSchema.options).toEqual(['codex_cli', 'claude_cli']);
  });

  it.each([
    ['linux'],
    ['freebsd'],
  ])('rejects unsupported Node platform %s without a fallback', (platform) => {
    expect(gatewayPlatformFromNodePlatform('darwin')).toBe('macos');
    expect(gatewayPlatformFromNodePlatform('win32')).toBe('windows');
    expect(() => gatewayPlatformFromNodePlatform(platform)).toThrow(
      'gateway_platform_unsupported',
    );
  });

  it('matches the Gateway package pins and Gateway staging vocabulary exactly', () => {
    // Anchor on this spec's own location so the suite reads the same Gateway
    // package from any working directory (package dir, repo root, `--root`).
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
    const packageRoot = resolve(repositoryRoot, 'apps/agent-gateway');
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      name: string;
      dependencies: Record<string, string>;
    };
    const stage = readFileSync(resolve(packageRoot, 'scripts/stage-bundled-runtime.mjs'), 'utf8');

    expect(manifest.name).toBe('@kiditem/agent-gateway');
    expect(manifest.dependencies['@openai/codex']).toBe(GATEWAY_RUNTIME_TRAIN.codexVersion);
    expect(manifest.dependencies['@anthropic-ai/claude-code']).toBe(GATEWAY_RUNTIME_TRAIN.claudeVersion);
    expect(stage).toContain('.kiditem-gateway-pack-staged');
    expect(stage).toContain('gateway_pack_platform_unsupported');
    expect(stage).not.toContain('runner_pack_');
  });
});
