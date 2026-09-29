import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClearCoupangCookiesMessageSchema,
  ClearCoupangCookiesResponseSchema,
  OpenCoupangShipmentPageMessageSchema,
  OpenCoupangShipmentPageResponseSchema,
} from '@kiditem/shared/extension-actions';

const mockSend = vi.hoisted(() => vi.fn());
vi.mock('../extension-bridge', () => ({ sendToExtension: mockSend }));

import {
  ExtensionMessageInvalidError,
  sendExtensionEntryAction,
} from '../extension-entry-action';

const clearCookies = { message: ClearCoupangCookiesMessageSchema, response: ClearCoupangCookiesResponseSchema };

describe('sendExtensionEntryAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the contract message and returns the parsed answer', async () => {
    mockSend.mockResolvedValueOnce({ success: true, cleared: 2, total: 3 });
    await expect(sendExtensionEntryAction('ext', clearCookies, { action: 'clearCoupangCookies' }, 20_000))
      .resolves.toEqual({ success: true, cleared: 2, total: 3 });
    expect(mockSend).toHaveBeenCalledWith('ext', { action: 'clearCoupangCookies' }, 20_000);
  });

  it('returns the shared failure envelope as a failure, not a contract break', async () => {
    mockSend.mockResolvedValueOnce({ success: false, errorCode: 'SITE_LOGIN_REQUIRED', error: '로그인이 필요합니다.' });
    await expect(sendExtensionEntryAction('ext', clearCookies, { action: 'clearCoupangCookies' }, 20_000))
      .resolves.toEqual({ success: false, errorCode: 'SITE_LOGIN_REQUIRED', error: '로그인이 필요합니다.' });
  });

  it('rejects an answer outside the contract, or none, as a contract break', async () => {
    mockSend.mockResolvedValueOnce({ success: true, cleared: 2 });
    await expect(sendExtensionEntryAction('ext', clearCookies, { action: 'clearCoupangCookies' }, 20_000))
      .rejects.toMatchObject({ name: 'ExtensionContractError', answered: true });
    mockSend.mockResolvedValueOnce(undefined);
    await expect(sendExtensionEntryAction('ext', clearCookies, { action: 'clearCoupangCookies' }, 20_000))
      .rejects.toMatchObject({ name: 'ExtensionContractError', answered: false });
  });

  it('refuses to send a message outside the contract', async () => {
    const openPage = { message: OpenCoupangShipmentPageMessageSchema, response: OpenCoupangShipmentPageResponseSchema };
    await expect(sendExtensionEntryAction('ext', openPage, { action: 'openCoupangShipmentPage', url: 'not a url' }, 20_000))
      .rejects.toBeInstanceOf(ExtensionMessageInvalidError);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
