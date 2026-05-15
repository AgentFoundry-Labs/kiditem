import { describe, expect, it, vi } from 'vitest';
import { archiveRegistrationWorkspaces } from './registration-workspace-delete';

describe('archiveRegistrationWorkspaces', () => {
  it('archives unique workspace ids concurrently and reports partial failures', async () => {
    const archive = vi.fn(async (id: string) => {
      if (id === 'workspace-fail') throw new Error('failed');
    });

    const result = await archiveRegistrationWorkspaces(
      ['workspace-1', 'workspace-fail', 'workspace-1', 'workspace-2'],
      archive,
    );

    expect(archive).toHaveBeenCalledTimes(3);
    expect(result.succeededIds).toEqual(['workspace-1', 'workspace-2']);
    expect(result.failedIds).toEqual(['workspace-fail']);
  });
});
