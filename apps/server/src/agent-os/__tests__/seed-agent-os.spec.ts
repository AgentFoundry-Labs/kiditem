import { describe, expect, it, vi } from 'vitest';
import { resolveAgentOsRepositoryRoot } from '../seed-agent-os';

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
