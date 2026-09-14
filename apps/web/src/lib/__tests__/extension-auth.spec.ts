import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api-error';
import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from '../extension-bridge';
import {
  clearExtensionAuth,
  syncExtensionAuth,
  transferExtensionAuthTo,
} from '../extension-auth';

const apiPostMock = vi.hoisted(() => vi.fn());

vi.mock('../extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectSourcingExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('../api-client', () => ({
  apiClient: { post: (...args: unknown[]) => apiPostMock(...args) },
}));

describe('syncExtensionAuth', () => {
  beforeEach(() => {
    vi.mocked(detectExtensionId).mockReset();
    vi.mocked(detectSourcingExtensionId).mockReset();
    vi.mocked(sendToExtension).mockReset();
    apiPostMock.mockReset();
    apiPostMock.mockResolvedValue({ token: 'a'.repeat(43) });
    vi.mocked(detectExtensionId).mockResolvedValue(null);
    vi.mocked(detectSourcingExtensionId).mockResolvedValue(null);
  });

  it('stores the current KidItem session token in every authenticated extension', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-ext');
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const token = 'a'.repeat(43);
    const result = await syncExtensionAuth();

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/extension-handoff', undefined, {
      timeoutMs: 15_000,
    });
    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'setAuthToken',
      token,
    });
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'setAuthToken',
      token,
    });
    expect(result).toEqual({
      coupang: { status: 'synced' },
      sourcing: { status: 'synced' },
    });
  });

  it('clears every installed extension token on sign-out', async () => {
    vi.mocked(detectExtensionId).mockResolvedValue('coupang-ext');
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const result = await clearExtensionAuth();

    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'clearAuthToken',
    });
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'clearAuthToken',
    });
    expect(result).toEqual({
      coupang: { status: 'cleared' },
      sourcing: { status: 'cleared' },
    });
  });

  it('does not fail login when optional extensions are not installed', async () => {
    await expect(
      syncExtensionAuth(),
    ).resolves.toEqual({
      coupang: { status: 'not_installed' },
      sourcing: { status: 'not_installed' },
    });
    expect(sendToExtension).not.toHaveBeenCalled();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('isolates one extension failure from the other extension', async () => {
    vi.mocked(detectExtensionId).mockRejectedValue(new Error('coupang unavailable'));
    vi.mocked(detectSourcingExtensionId).mockResolvedValue('sourcing-ext');
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    const token = 'a'.repeat(43);
    const result = await syncExtensionAuth();

    expect(sendToExtension).toHaveBeenCalledTimes(1);
    expect(sendToExtension).toHaveBeenCalledWith('sourcing-ext', {
      action: 'setAuthToken',
      token,
    });
    expect(result).toEqual({
      coupang: { status: 'failed' },
      sourcing: { status: 'synced' },
    });
  });

  it('hands auth to one already selected extension immediately before work', async () => {
    vi.mocked(sendToExtension).mockResolvedValue({ success: true });

    await expect(transferExtensionAuthTo('coupang-ext')).resolves.toBeUndefined();

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/extension-handoff', undefined, {
      timeoutMs: 15_000,
    });
    expect(sendToExtension).toHaveBeenCalledWith('coupang-ext', {
      action: 'setAuthToken',
      token: 'a'.repeat(43),
    });
  });

  it('fails with a Korean reason and sends nothing when the handoff token request passes its deadline', async () => {
    apiPostMock.mockRejectedValue(
      new ApiError(0, 'request_timeout', '요청 시간이 초과되었습니다. 다시 시도해주세요.'),
    );

    await expect(transferExtensionAuthTo('coupang-ext')).rejects.toThrow(
      '확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('fails with a Korean reason when the extension does not take the token', async () => {
    vi.mocked(sendToExtension).mockResolvedValueOnce({ success: false, error: 'Invalid auth token' });
    await expect(transferExtensionAuthTo('coupang-ext')).rejects.toThrow(
      '확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );

    vi.mocked(sendToExtension).mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    await expect(transferExtensionAuthTo('coupang-ext')).rejects.toThrow(
      '확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );

    vi.mocked(sendToExtension).mockRejectedValueOnce(new Error('익스텐션 응답 시간이 초과되었습니다.'));
    await expect(transferExtensionAuthTo('coupang-ext')).rejects.toThrow(
      '익스텐션 응답 시간이 초과되었습니다.',
    );
  });
});
