'use client';

import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { queryKeys } from '@/lib/query-keys';
import { sourcingOperationCollection } from './sourcing-operations';
import type { OperationView } from '@kiditem/shared/operation';

const INVALID_URL = '1688 라이브(zb.1688.com) 또는 도우인(live.douyin.com) 방송 URL을 넣어 주세요.';

/** 방송 URL → 실행 scope. 서버와 같게 `new URL().toString()`으로 맞추고 호스트로 플랫폼을 정한다. */
export function liveCommerceScope(url: string): { platform: '1688' | 'douyin'; url: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(INVALID_URL);
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') throw new Error(INVALID_URL);
  if (host === '1688.com' || host.endsWith('.1688.com')) return { platform: '1688', url: parsed.toString() };
  if (host === 'douyin.com' || host.endsWith('.douyin.com')) return { platform: 'douyin', url: parsed.toString() };
  throw new Error(INVALID_URL);
}

function normalizedOrNull(url: string | null): string | null {
  if (url === null) return null;
  try {
    return liveCommerceScope(url).url;
  } catch {
    return null;
  }
}

/** 이 방송(plan.pageUrl)의 실행인가. URL이 없거나 방송 URL이 아니면 아무 실행도 아니다. */
export function liveCommerceOperationMatch(url: string | null): (operation: OperationView) => boolean {
  const pageUrl = normalizedOrNull(url);
  return (operation) => pageUrl !== null && operation.plan?.pageUrl === pageUrl;
}

/**
 * 방송 하나의 브라우저 수집(`sourcing.live_commerce`, KID-360). 조직의 라이브 수집 실행을 한 번 읽고 이 방송
 * (plan.pageUrl)의 것만 본다. 방송 CTA가 URL로 시작하고, 끝나면 라이브 방송·상품·키워드 읽기를 다시 읽는다.
 */
export function sourcingLiveCommerceBrowserCollection(url: string | null) {
  return sourcingOperationCollection<string>({
    kind: SOURCING_OPERATION_KINDS.liveCommerce,
    // 컨트롤 키는 kind 하나다 — 방송 URL이 바뀌어도 방금 보낸 시작의 결과·거절을 같은 컨트롤이 본다. 방송 구분은 match가 한다.
    sourceKey: SOURCING_OPERATION_KINDS.liveCommerce,
    label: '라이브 방송 수집',
    match: liveCommerceOperationMatch(url),
    scope: (input) => liveCommerceScope(input),
    onNewComplete: (queryClient) => {
      for (const queryKey of [
        [...queryKeys.sourcing.all, 'live-commerce', 'snapshots'],
        [...queryKeys.sourcing.all, 'live-commerce', 'keywords'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
