import { ExtensionAuthHandoffSchema } from '@kiditem/shared/auth';
import {
  AuthTokenResponseSchema,
  CLEAR_AUTH_TOKEN_ACTION,
  ClearAuthTokenMessageSchema,
  SET_AUTH_TOKEN_ACTION,
  SetAuthTokenMessageSchema,
} from '@kiditem/shared/extension-actions';
import { apiClient } from './api-client';
import { detectExtensionId, detectSourcingExtensionId } from './extension-bridge';
import { sendExtensionEntryAction } from './extension-entry-action';
import { operatorReason } from './operator-error';

export const EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';

// The handoff runs right before a collection starts. Past this deadline the
// start releases with a reason instead of waiting on the token request; the
// extension message keeps its own 15-second limit.
const HANDOFF_TOKEN_TIMEOUT_MS = 15_000;
const HANDOFF_FAILED = '확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.';

const EXTENSION_AUTH_MESSAGE_TIMEOUT_MS = 15_000;
const SET_AUTH_TOKEN = { message: SetAuthTokenMessageSchema, response: AuthTokenResponseSchema };
const CLEAR_AUTH_TOKEN = { message: ClearAuthTokenMessageSchema, response: AuthTokenResponseSchema };

/** 확장이 토큰을 받았는가. 계약 밖의 답·실패 봉투는 받지 않은 것이다. */
function setAuthToken(extensionId: string, token: string) {
  return sendExtensionEntryAction(
    extensionId,
    SET_AUTH_TOKEN,
    { action: SET_AUTH_TOKEN_ACTION, token },
    EXTENSION_AUTH_MESSAGE_TIMEOUT_MS,
  );
}
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
  return new Error(operatorReason(message, HANDOFF_FAILED));
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
  let response: Awaited<ReturnType<typeof setAuthToken>>;
  try {
    response = await setAuthToken(extensionId, token);
  } catch (error) {
    throw handoffFailure(error instanceof Error ? error.message : null);
  }
  if (!response.success) throw handoffFailure(response.errorCode);
}

async function sendAuth(
  detection: Detection,
  token: string | null,
): Promise<ExtensionAuthSyncStatus> {
  if (detection.status === 'failed') return { status: 'failed' };
  if (detection.status === 'not_installed') return { status: 'not_installed' };
  if (token === null) return { status: 'failed' };
  try {
    const response = await setAuthToken(detection.extensionId, token);
    return response.success ? { status: 'synced' } : { status: 'failed' };
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
    const response = await sendExtensionEntryAction(
      detection.extensionId,
      CLEAR_AUTH_TOKEN,
      { action: CLEAR_AUTH_TOKEN_ACTION },
      EXTENSION_AUTH_MESSAGE_TIMEOUT_MS,
    );
    return response.success ? { status: 'cleared' } : { status: 'failed' };
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
