'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { registrationAdapterFor } from './adapters';
import { mallPublishingApi } from './mall-publishing-api';
import {
  capabilityTotals,
  mallCapabilities,
  registerNoteFor,
  soldOutNoteFor,
  sortByCapability,
} from './mall-capabilities';

/**
 * 연결된 몰마다 무엇이 되는가 — 쇼핑몰 현황과 쇼핑몰 홈이 **같은 판정**을 읽는다.
 *
 * 두 화면이 따로 계산하면 옥션처럼 판정이 바뀌는 날 한쪽은 13곳, 다른 쪽은 14곳이 된다.
 * 판정은 여기 한 곳에서 한다.
 *
 * 매니페스트는 '이 몰엔 그 일이 없다(빨강)' 와 품절 사연을 가르는 데 쓴다. 못 받아도
 * 화면은 선다 — 그때는 없는 일로 단정하지 않고 '아직' 으로 둔다.
 */
export function useMallCapabilityRows() {
  const overviewQuery = useQuery({
    queryKey: queryKeys.mallPublishing.channelOverview(),
    queryFn: mallPublishingApi.channelOverview,
  });
  const manifestsQuery = useQuery({
    queryKey: queryKeys.mallPublishing.manifests(),
    queryFn: mallPublishingApi.manifests,
  });

  const overview = overviewQuery.data;

  const rows = useMemo(() => {
    const channels = overview?.channels ?? [];
    const manifests = Array.isArray(manifestsQuery.data) ? manifestsQuery.data : [];
    const manifestByKey = new Map(manifests.map((manifest) => [manifest.key, manifest]));
    const names = new Map(channels.map((channel) => [channel.mallKey, channel.mallName]));
    const mallNameOf = (key: string) => names.get(key) ?? key;
    return sortByCapability(
      channels.map((channel) => {
        // 제 어댑터가 없어도 다른 몰 등록에 함께 실리면(옥션 ← G마켓 ESM) 상품등록이 된다.
        const adapter = registrationAdapterFor(channel.mallKey);
        const manifest = manifestByKey.get(channel.mallKey) ?? null;
        return {
          channel,
          capabilities: mallCapabilities(channel, { hasAdapter: Boolean(adapter), manifest }),
          notes: {
            register: registerNoteFor(channel.mallKey, adapter, mallNameOf),
            soldout: soldOutNoteFor(manifest),
          },
        };
      }),
    );
  }, [overview, manifestsQuery.data]);

  const totals = useMemo(() => capabilityTotals(rows), [rows]);

  return { overviewQuery, overview, rows, totals };
}
