'use client';

import { useEffect } from 'react';
import { useRocketChannelAccounts } from '@/hooks/useRocketChannelAccounts';

/**
 * 내부 로켓 식별자가 하나면 자동으로 전달하고, 여러 개일 때만 작은 선택기를 보여준다.
 * 여러 계정 중 첫 번째를 암묵적으로 고르지 않는다.
 */
export function RocketAccountBootstrap({
  selectedAccountId,
  onSelectedAccountIdChange,
  onAccountChange,
}: {
  selectedAccountId: string;
  onSelectedAccountIdChange: (accountId: string) => void;
  onAccountChange: (account: {
    id: string;
    name: string;
    vendorId: string | null;
  } | null) => void;
}) {
  const { rocketAccounts, isSuccess } = useRocketChannelAccounts();
  const selectedAccount = rocketAccounts.length === 1
    ? rocketAccounts[0]!
    : rocketAccounts.find(({ id }) => id === selectedAccountId) ?? null;

  useEffect(() => {
    if (!isSuccess) return;
    onAccountChange(selectedAccount ? {
      id: selectedAccount.id,
      name: selectedAccount.name,
      vendorId: selectedAccount.vendorId ?? null,
    } : null);
  }, [isSuccess, onAccountChange, selectedAccount]);

  useEffect(() => {
    if (!isSuccess) return;
    if (
      selectedAccountId
      && rocketAccounts.length !== 1
      && !rocketAccounts.some(({ id }) => id === selectedAccountId)
    ) {
      onSelectedAccountIdChange('');
    }
  }, [isSuccess, onSelectedAccountIdChange, rocketAccounts, selectedAccountId]);

  if (rocketAccounts.length <= 1) return null;

  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs font-semibold text-slate-600">
      <span>로켓 채널 계정</span>
      <select
        aria-label="로켓 채널 계정"
        value={selectedAccount?.id ?? ''}
        onChange={(event) => onSelectedAccountIdChange(event.target.value)}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
      >
        <option value="">계정 선택</option>
        {rocketAccounts.map((account) => (
          <option key={account.id} value={account.id}>{account.name}</option>
        ))}
      </select>
    </label>
  );
}
