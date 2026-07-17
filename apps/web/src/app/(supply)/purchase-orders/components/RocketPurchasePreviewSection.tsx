'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';
import { RocketInventoryCommitmentList } from './RocketInventoryCommitmentList';

const ChannelAccountListSchema = z.array(ChannelAccountListItemSchema);

export function RocketPurchasePreviewSection() {
  const [selectedRocketAccountId, setSelectedRocketAccountId] = useState('');
  const accountsQuery = useQuery({
    queryKey: queryKeys.channelAccounts.active(),
    queryFn: () => apiClient.getParsed('/api/channels/accounts', ChannelAccountListSchema),
  });
  const accounts = (accountsQuery.data ?? []).filter((account) => account.channel === 'rocket');
  const selectedAccount = accounts.find(({ id }) => id === selectedRocketAccountId)
    ?? accounts[0]
    ?? null;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">쿠팡 로켓 발주 미리보기</h2>
          <p className="text-sm text-slate-500">
            활성 로켓 계정을 선택하고 Sellpia 최신 재고 기준 검토수량을 계산합니다.
          </p>
        </div>
        <SellpiaWorkspaceFreshnessStatus />
      </div>
      {selectedAccount ? (
        <>
          <label className="block max-w-md space-y-1 text-sm font-semibold text-slate-600">
            <span>로켓 채널 계정</span>
            <select
              aria-label="로켓 채널 계정"
              value={selectedAccount.id}
              onChange={(event) => setSelectedRocketAccountId(event.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <RocketPurchaseWorkspace
            key={selectedAccount.id}
            channelAccountId={selectedAccount.id}
          />
          <RocketInventoryCommitmentList channelAccountId={selectedAccount.id} />
        </>
      ) : accountsQuery.isLoading ? (
        <p className="text-sm text-slate-500">로켓 계정을 불러오는 중입니다.</p>
      ) : (
        <p className="text-sm text-amber-700">활성 로켓 채널 계정이 없습니다.</p>
      )}
    </section>
  );
}
