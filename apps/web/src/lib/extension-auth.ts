import { ExtensionAuthHandoffSchema } from '@kiditem/shared/auth';
import { apiClient } from './api-client';
import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from './extension-bridge';

export const EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';

// The handoff runs right before a collection starts. Past this deadline the
// start releases with a reason instead of waiting on the token request; the
// extension message keeps sendToExtension's own 15-second default.
const HANDOFF_TOKEN_TIMEOUT_MS = 15_000;
const HANDOFF_FAILED = '확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.';
const HANGUL = /[가-힣]/;

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
    await apiClient.post<unknown>('/api/auth/extension-handoff', undefined, {
      timeoutMs: HANDOFF_TOKEN_TIMEOUT_MS,
    }),
  );
  return response.token;
}

function handoffFailure(message: unknown): Error {
  const text = typeof message === 'string' ? message.trim() : '';
  return new Error(HANGUL.test(text) ? text : HANDOFF_FAILED);
}

/**
 * Explicitly transfer cookie-backed auth to one selected extension. Every
 * failure, including a deadline passing, rejects with a Korean reason.
 */
export async function transferExtensionAuthTo(
  extensionId: string,
): Promise<void> {
  let token: string;
  try {
    token = await requestExtensionHandoffToken();
  } catch {
    throw new Error(HANDOFF_FAILED);
  }
  let response: ExtensionResponse | undefined;
  try {
    response = await sendToExtension<ExtensionResponse>(extensionId, {
      action: 'setAuthToken',
      token,
    });
  } catch (error) {
    throw handoffFailure(error instanceof Error ? error.message : null);
  }
  if (response?.success === false) throw handoffFailure(response.error);
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
