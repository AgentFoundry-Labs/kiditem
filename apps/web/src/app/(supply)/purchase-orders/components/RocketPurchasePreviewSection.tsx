'use client';

import { useEffect, useState } from 'react';
import { useRocketChannelAccounts } from '@/hooks/useRocketChannelAccounts';
import type { RocketOrderActivityInput } from '@/lib/rocket-order-activity';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';

export function RocketPurchasePreviewSection({
  from,
  to,
  savedSourceImportRunId = null,
  onAccountChange,
  onCatalogSaved,
  onActivity,
}: {
  /** 입고예정일 조회 범위 — 로켓 발주 캘린더가 단일 소스다. */
  from: string;
  to: string;
  savedSourceImportRunId?: string | null;
  onAccountChange?: (account: { id: string; vendorId: string | null }) => void;
  onCatalogSaved?: () => void;
  onActivity?: (activity: RocketOrderActivityInput) => void;
}) {
  const [selectedRocketAccountId, setSelectedRocketAccountId] = useState('');
  const {
    rocketAccounts: accounts,
    isLoading: accountsLoading,
    isBootstrapping,
    error: accountError,
  } = useRocketChannelAccounts();
  const selectedAccount = accounts.find(({ id }) => id === selectedRocketAccountId)
    ?? accounts[0]
    ?? null;

  useEffect(() => {
    if (!selectedAccount) return;
    onAccountChange?.({
      id: selectedAccount.id,
      vendorId: selectedAccount.vendorId ?? null,
    });
  }, [onAccountChange, selectedAccount]);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-bold text-slate-900">쿠팡 로켓 발주 미리보기</h2>
        <p className="text-sm text-slate-500">
          쿠팡 익스텐션 계정을 자동으로 연결하고 Sellpia 최신 재고 기준 검토수량을 계산합니다.
        </p>
      </div>
      {selectedAccount ? (
        <>
          {accounts.length > 1 ? (
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
          ) : null}
          <RocketPurchaseWorkspace
            key={selectedAccount.id}
            channelAccountId={selectedAccount.id}
            hasConfiguredVendorId={Boolean(selectedAccount.vendorId?.trim())}
            from={from}
            to={to}
            savedSourceImportRunId={savedSourceImportRunId}
            onCatalogSaved={onCatalogSaved}
            onActivity={onActivity}
          />
        </>
      ) : accountsLoading || isBootstrapping ? (
        <p className="text-sm text-slate-500">로켓 계정을 자동으로 연결하는 중입니다.</p>
      ) : (
        <p className="text-sm text-amber-700">
          {accountError
            ? '로켓 계정을 자동으로 연결하지 못했습니다.'
            : '쿠팡 익스텐션에서 계정 정보를 먼저 감지해주세요.'}
        </p>
      )}
    </section>
  );
}
