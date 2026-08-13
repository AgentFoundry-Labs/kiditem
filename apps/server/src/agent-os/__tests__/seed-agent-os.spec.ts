import { afterEach, describe, expect, it, vi } from 'vitest';
import { findAgentDefinitionByType } from '../domain/agent-definition.registry';
import {
  resolveAgentOsRepositoryRoot,
  resolveSeedAdapterType,
} from '../seed-agent-os';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAgentOsRepositoryRoot', () => {
  it('resolves the repository root from a production module path without consulting cwd', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/arbitrary/process/cwd');

    expect(
      resolveAgentOsRepositoryRoot('/app/apps/server/dist/agent-os'),
    ).toBe('/app');
    expect(cwd).not.toHaveBeenCalled();

    cwd.mockRestore();
  });
});

describe('resolveSeedAdapterType', () => {
  it.each([
    [undefined, 'codex_cli'],
    ['claude_cli', 'claude_cli'],
    ['codex_cli', 'codex_cli'],
  ] as const)('resolves Sourcing adapter %s to %s', (configured, expected) => {
    if (configured) vi.stubEnv('AGENT_SOURCING_ADAPTER_TYPE', configured);
    const sourcing = findAgentDefinitionByType('sourcing');

    expect(resolveSeedAdapterType(sourcing!)).toBe(expected);
  });

  it('rejects an unknown Sourcing adapter without a fallback', () => {
    vi.stubEnv('AGENT_SOURCING_ADAPTER_TYPE', 'local');
    const sourcing = findAgentDefinitionByType('sourcing');

    expect(() => resolveSeedAdapterType(sourcing!)).toThrow(
      'AGENT_SOURCING_ADAPTER_TYPE must be claude_cli or codex_cli.',
    );
  });

  it('does not override another agent definition', () => {
    vi.stubEnv('AGENT_SOURCING_ADAPTER_TYPE', 'claude_cli');
    const listing = findAgentDefinitionByType('listing');

    expect(resolveSeedAdapterType(listing!)).toBe(listing!.defaultAdapterType);
  });
});
