import { afterEach, describe, expect, it } from 'vitest';
import { currentWorkRuntimeIdentity } from './agent-worker-application.module';

const original = { version: process.env.KIDITEM_APPLICATION_VERSION, sha: process.env.KIDITEM_GIT_SHA, gitSha: process.env.GIT_SHA };
afterEach(() => {
  if (original.version === undefined) delete process.env.KIDITEM_APPLICATION_VERSION; else process.env.KIDITEM_APPLICATION_VERSION = original.version;
  if (original.sha === undefined) delete process.env.KIDITEM_GIT_SHA; else process.env.KIDITEM_GIT_SHA = original.sha;
  if (original.gitSha === undefined) delete process.env.GIT_SHA; else process.env.GIT_SHA = original.gitSha;
});

describe('worker runtime identity', () => {
  it('rejects silent version and SHA fallbacks', () => {
    delete process.env.KIDITEM_APPLICATION_VERSION; delete process.env.KIDITEM_GIT_SHA; delete process.env.GIT_SHA;
    expect(currentWorkRuntimeIdentity).toThrow('missing_required_work_runtime_identity');
  });

  it('uses an explicit deploy identity for mutation fences', () => {
    process.env.KIDITEM_APPLICATION_VERSION = '1.2.3'; process.env.KIDITEM_GIT_SHA = 'a'.repeat(40);
    expect(currentWorkRuntimeIdentity()).toEqual({ applicationVersion: '1.2.3', gitSha: 'a'.repeat(40) });
  });
});
