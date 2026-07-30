import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from './extension-bridge';
import type { BrowserAuthSession } from './auth/session';

export const EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';

type SessionWithToken = Pick<BrowserAuthSession, 'token'> | null;
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

type DetectExtension = () => Promise<string | null>;

async function syncTarget(
  detect: DetectExtension,
  session: SessionWithToken,
): Promise<ExtensionAuthSyncStatus> {
  try {
    const extensionId = await detect();
    if (!extensionId) return { status: 'not_installed' };

    const message = session?.token
      ? {
          action: 'setAuthToken',
          token: session.token,
        }
      : { action: 'clearAuthToken' };
    const response = await sendToExtension<ExtensionResponse>(
      extensionId,
      message,
    );
    if (response?.success === false) return { status: 'failed' };
    return { status: session?.token ? 'synced' : 'cleared' };
  } catch {
    return { status: 'failed' };
  }
}

export async function syncExtensionAuth(
  session: SessionWithToken,
): Promise<ExtensionAuthSyncResult> {
  const [coupang, sourcing] = await Promise.all([
    syncTarget(() => detectExtensionId(), session),
    syncTarget(() => detectSourcingExtensionId(), session),
  ]);
  return { coupang, sourcing };
}
