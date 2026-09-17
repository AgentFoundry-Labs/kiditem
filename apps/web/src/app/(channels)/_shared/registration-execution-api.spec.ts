import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { registrationExecutionApi } from './registration-execution-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn().mockResolvedValue({}) },
}));

const CANDIDATE = 'candidate-1';
const EXECUTION = '33333333-3333-4333-8333-333333333333';
const BASE = `/api/channels/candidates/${CANDIDATE}/registration-executions`;

describe('registration execution client', () => {
  beforeEach(() => vi.mocked(apiClient.post).mockClear());

  it('opens the fence on the Channels route, not on a sourcing route', async () => {
    await registrationExecutionApi.prepare(CANDIDATE, {
      channelAccountId: 'account-1',
      displayName: 'Kids rain boots',
      registrationInput: {},
      idempotencyKey: EXECUTION,
    });

    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/prepare`, expect.objectContaining({
      channelAccountId: 'account-1',
    }));
  });

  it.each([
    ['start', () => registrationExecutionApi.start(CANDIDATE, EXECUTION), `${BASE}/${EXECUTION}/start`],
    ['unresolved', () => registrationExecutionApi.markUnresolved(CANDIDATE, EXECUTION, { reason: 'x' }), `${BASE}/${EXECUTION}/unresolved`],
    ['not-submitted', () => registrationExecutionApi.markNotSubmitted(CANDIDATE, EXECUTION, { reason: 'x' }), `${BASE}/${EXECUTION}/not-submitted`],
  ])('addresses one execution by id for %s', async (_name, call, expected) => {
    await call();
    expect(apiClient.post).toHaveBeenCalledWith(expected, expect.anything());
  });

  it('confirms a registration on the same execution-scoped route', async () => {
    await registrationExecutionApi.confirm(CANDIDATE, {
      executionId: EXECUTION,
      externalListingId: '427011919',
    });
    expect(apiClient.post).toHaveBeenCalledWith(`${BASE}/confirm`, expect.objectContaining({
      externalListingId: '427011919',
    }));
  });

  it('escapes a candidate or execution id so a path segment cannot be forged', async () => {
    await registrationExecutionApi.start('a/../b', '1/2');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/channels/candidates/a%2F..%2Fb/registration-executions/1%2F2/start',
      {},
    );
  });

  /**
   * 울타리에 닿는 길은 이 파일 하나다(ADR-0014). 화면마다 자기 호출을 두면
   * "같은 초안을 한 계정에 두 번 보내지 않는다"가 화면마다 달라진다.
   */
  it('is the only web module that addresses the registration execution routes', () => {
    const webSrc = path.resolve(__dirname, '../../..');
    const hits = execFileSync('rg', [
      '--files-with-matches',
      '--glob', '!**/*.spec.*',
      'registration-executions',
      webSrc,
    ], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((file) => path.relative(webSrc, file));

    expect(hits).toEqual(['app/(channels)/_shared/registration-execution-api.ts']);
  });
});
