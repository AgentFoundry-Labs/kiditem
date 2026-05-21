import type { Session } from '@supabase/supabase-js';
import { apiClient } from './api-client';
import { getApiBase } from './api';
import { detectSourcingExtensionId, sendToExtension } from './extension-bridge';

type SessionWithToken = Pick<Session, 'access_token'> | null;
type ExtensionResponse = { success?: boolean; error?: string };
type SourcingExtensionSessionResponse = {
  token: string;
  expiresAt: string;
  maxExpiresAt: string;
};

export async function syncSourcingExtensionAuth(session: SessionWithToken): Promise<boolean> {
  const extensionId = await detectSourcingExtensionId();
  if (!extensionId) return false;

  try {
    const message = session?.access_token
      ? {
          action: 'setAuthToken',
          apiBase: sourcingExtensionApiBase(),
          ...(await apiClient.post<SourcingExtensionSessionResponse>(
            '/api/sourcing/extension/session',
            {},
          )),
        }
      : { action: 'clearAuthToken' };
    const response = await sendToExtension<ExtensionResponse>(extensionId, message);
    return response?.success !== false;
  } catch {
    return false;
  }
}

function sourcingExtensionApiBase(): string {
  const configuredApiBase = getApiBase();
  const base =
    configuredApiBase ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/api/sourcing/extension`;
}
