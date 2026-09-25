import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { collectorFor } from '../collectors';
import type { ApiPort } from '../core/api';
import type { BrowserResources } from '../core/browser';
import { createOperationClient } from '../core/operation-client';
import { createRunner } from '../core/runner';
import { createSourcingSiteHandles, type SourcingSiteDeps } from './sourcing-site-handles';

/** 팝업 `현재 상품 수집`의 메시지(옛 sourcing 워커와 같은 모양). */
export const COLLECT_CURRENT = 'COLLECT_CURRENT' as const;
/** KidItem 페이지가 긴 수집 동안 서비스워커를 살려 두려고 여는 포트(옛 이름 그대로 — host-bridge가 연다). */
export const HOST_KEEPALIVE_PORT = 'kiditem-1688-trend-keepalive' as const;

export interface ProductCollectDeps {
  apiFor(environmentId: string): ApiPort;
  browser: BrowserResources;
  site: SourcingSiteDeps;
  getTab(tabId: number): Promise<{ url?: string }>;
  keepAlive?(work: Promise<unknown>): void;
}

export type ProductCollectResponse = { ok: true; operationId: string } | { ok: false; error: string; errorCode?: string };

/** 탭 주소 → 상품 확장 scope. 1688·Alibaba https 주소만. */
export function productExtensionScope(url: string | undefined): { platform: '1688' | 'alibaba'; url: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (host === '1688.com' || host.endsWith('.1688.com')) return { platform: '1688', url: parsed.toString() };
    if (host === 'alibaba.com' || host.endsWith('.alibaba.com')) return { platform: 'alibaba', url: parsed.toString() };
    return null;
  } catch {
    return null;
  }
}

/**
 * 팝업 `COLLECT_CURRENT {tabId, environmentId}` → `sourcing.product_extension` 실행 하나(KID-360). 운영자 탭을 사이트에
 * 묶어 runner로 끝까지 돌리고 팝업에 `{ok}` / `{ok:false, error}`로 답한다(옛 응답 모양).
 */
export async function collectCurrentProduct(deps: ProductCollectDeps, input: { tabId: number; environmentId: string }): Promise<ProductCollectResponse> {
  const tab = await deps.getTab(input.tabId).catch(() => null);
  const scope = productExtensionScope(tab?.url);
  if (!scope) return { ok: false, error: '1688 또는 Alibaba 상품 페이지에서 수집해 주세요.' };
  const runner = createRunner({
    client: createOperationClient(deps.apiFor(input.environmentId)),
    browser: deps.browser,
    siteFor: createSourcingSiteHandles(deps.site, input.tabId),
  }, collectorFor);
  const work = runner.run({ kind: SOURCING_OPERATION_KINDS.productExtension, scope, signal: new AbortController().signal });
  deps.keepAlive?.(work);
  const outcome = await work;
  if (outcome.kind === 'finished' && outcome.operation.status === 'succeeded') return { ok: true, operationId: outcome.operation.id };
  if (outcome.kind === 'failed') return { ok: false, errorCode: outcome.errorCode, error: outcome.errorMessage };
  if (outcome.kind === 'already_running') return { ok: false, errorCode: 'OPERATION_IN_PROGRESS', error: outcome.message ?? '이 상품 수집이 이미 진행 중입니다.' };
  if (outcome.kind === 'fence_lost') return { ok: false, errorCode: 'OPERATION_FENCE_LOST', error: '수집이 더 이상 유효하지 않습니다. 다시 수집해 주세요.' };
  return { ok: false, error: outcome.operation.errorMessage ?? '상품 수집에 실패했습니다.' };
}

/** `chrome.runtime`의 최소 모양(팝업 메시지·keepalive 포트). */
export interface ProductCollectChrome {
  runtime: {
    onMessage: { addListener(listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void): void };
    onConnect: { addListener(listener: (port: { name: string; onMessage: { addListener(listener: () => void): void } }) => void): void };
  };
}

/** 팝업 메시지와 KidItem 페이지 keepalive 포트를 받는다(옛 sourcing 워커가 하던 두 가지). */
export function installProductCollect(chromeApi: ProductCollectChrome, deps: ProductCollectDeps): void {
  chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const record = message && typeof message === 'object' ? (message as Record<string, unknown>) : null;
    if (record?.type !== COLLECT_CURRENT) return;
    const tabId = record.tabId;
    const environmentId = record.environmentId;
    if (typeof tabId !== 'number' || typeof environmentId !== 'string' || !environmentId) {
      sendResponse({ ok: false, error: '수집할 탭과 KidItem 환경을 확인해 주세요.' });
      return;
    }
    collectCurrentProduct(deps, { tabId, environmentId }).then(sendResponse, (error: unknown) =>
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });
  chromeApi.runtime.onConnect.addListener((port) => {
    if (port.name !== HOST_KEEPALIVE_PORT) return;
    // 메시지를 받는 것 자체가 keepalive 신호다 — 답할 것은 없다.
    port.onMessage.addListener(() => undefined);
  });
}
