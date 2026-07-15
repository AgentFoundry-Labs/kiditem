import type { Session } from '@supabase/supabase-js';
import { getApiBase } from './api';
import {
  detectExtensionId,
  detectSourcingExtensionId,
  sendToExtension,
} from './extension-bridge';

export const EXTENSION_AUTH_REQUIRED_EVENT = 'kiditem:extension-auth-required';

type SessionWithToken = Pick<Session, 'access_token'> | null;
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
  apiBase?: string,
): Promise<ExtensionAuthSyncStatus> {
  try {
    const extensionId = await detect();
    if (!extensionId) return { status: 'not_installed' };

    const message = session?.access_token
      ? {
          action: 'setAuthToken',
          ...(apiBase ? { apiBase } : {}),
          token: session.access_token,
        }
      : { action: 'clearAuthToken' };
    const response = await sendToExtension<ExtensionResponse>(
      extensionId,
      message,
    );
    if (response?.success === false) return { status: 'failed' };
    return { status: session?.access_token ? 'synced' : 'cleared' };
  } catch {
    return { status: 'failed' };
  }
}

export async function syncExtensionAuth(
  session: SessionWithToken,
): Promise<ExtensionAuthSyncResult> {
  const [coupang, sourcing] = await Promise.all([
    syncTarget(() => detectExtensionId(), session),
    syncTarget(
      () => detectSourcingExtensionId(),
      session,
      sourcingExtensionApiBase(),
    ),
  ]);
  return { coupang, sourcing };
}

function sourcingExtensionApiBase(): string {
  const configuredApiBase = getApiBase();
  const base =
    configuredApiBase ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/api/sourcing/extension`;
}
