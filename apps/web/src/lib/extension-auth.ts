import { ExtensionAuthHandoffSchema } from '@kiditem/shared/auth';
import { apiClient } from './api-client';
import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from './extension-bridge';

export const EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';

type ExtensionResponse = { success?: boolean; error?: string };
type ExtensionAuthSyncStatus =
  | { status: 'synced' }
  | { status: 'cleared' }
  | { status: 'not_installed' }
  | { status: 'failed' };

export type ExtensionAuthSyncResult = Record<
  'coupang' | 'sourcing',
  ExtensionAuthSyncStatus
>;

type Detection =
  | { status: 'installed'; extensionId: string }
  | { status: 'not_installed' }
  | { status: 'failed' };

async function detect(
  operation: () => Promise<string | null>,
): Promise<Detection> {
  try {
    const extensionId = await operation();
    return extensionId
      ? { status: 'installed', extensionId }
      : { status: 'not_installed' };
  } catch {
    return { status: 'failed' };
  }
}

async function requestExtensionHandoffToken(): Promise<string> {
  const response = ExtensionAuthHandoffSchema.parse(
    await apiClient.post<unknown>('/api/auth/extension-handoff'),
  );
  return response.token;
}

/** Explicitly transfer cookie-backed auth to one selected extension. */
export async function transferExtensionAuthTo(
  extensionId: string,
): Promise<void> {
  const token = await requestExtensionHandoffToken();
  const response = await sendToExtension<ExtensionResponse>(extensionId, {
    action: 'setAuthToken',
    token,
  });
  if (response?.success === false) {
    throw new Error(response.error ?? '확장프로그램 인증 전달에 실패했습니다.');
  }
}

async function sendAuth(
  detection: Detection,
  token: string | null,
): Promise<ExtensionAuthSyncStatus> {
  if (detection.status === 'failed') return { status: 'failed' };
  if (detection.status === 'not_installed') return { status: 'not_installed' };
  if (token === null) return { status: 'failed' };
  try {
    const response = await sendToExtension<ExtensionResponse>(
      detection.extensionId,
      { action: 'setAuthToken', token },
    );
    return response?.success === false ? { status: 'failed' } : { status: 'synced' };
  } catch {
    return { status: 'failed' };
  }
}

async function clearAuth(
  detection: Detection,
): Promise<ExtensionAuthSyncStatus> {
  if (detection.status === 'failed') return { status: 'failed' };
  if (detection.status === 'not_installed') return { status: 'not_installed' };
  try {
    const response = await sendToExtension<ExtensionResponse>(
      detection.extensionId,
      { action: 'clearAuthToken' },
    );
    return response?.success === false ? { status: 'failed' } : { status: 'cleared' };
  } catch {
    return { status: 'failed' };
  }
}

/** Detect installed extensions, then perform one explicit credential handoff. */
export async function syncExtensionAuth(): Promise<ExtensionAuthSyncResult> {
  const [coupangDetection, sourcingDetection] = await Promise.all([
    detect(() => detectExtensionId()),
    detect(() => detectSourcingExtensionId()),
  ]);
  const hasInstalled = [coupangDetection, sourcingDetection].some(
    (entry) => entry.status === 'installed',
  );
  let token: string | null = null;
  if (hasInstalled) {
    try {
      token = await requestExtensionHandoffToken();
    } catch {
      token = null;
    }
  }
  const [coupang, sourcing] = await Promise.all([
    sendAuth(coupangDetection, token),
    sendAuth(sourcingDetection, token),
  ]);
  return { coupang, sourcing };
}

export async function clearExtensionAuth(): Promise<ExtensionAuthSyncResult> {
  const [coupangDetection, sourcingDetection] = await Promise.all([
    detect(() => detectExtensionId()),
    detect(() => detectSourcingExtensionId()),
  ]);
  const [coupang, sourcing] = await Promise.all([
    clearAuth(coupangDetection),
    clearAuth(sourcingDetection),
  ]);
  return { coupang, sourcing };
}
