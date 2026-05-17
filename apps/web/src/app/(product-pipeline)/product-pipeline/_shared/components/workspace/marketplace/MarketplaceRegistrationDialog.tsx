import { useEffect, useState } from 'react';
import type { ChannelAccountOption } from '@/app/(product-pipeline)/product-pipeline/registered-products/lib/channel-listings-api';

interface MarketplaceRegistrationDialogProps {
  open: boolean;
  accounts: ChannelAccountOption[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    channelAccountId: string;
    externalId: string;
    channelName?: string | null;
    channelPrice?: number | null;
  }) => void;
}

export default function MarketplaceRegistrationDialog({
  open,
  accounts,
  isSubmitting,
  onClose,
  onSubmit,
}: MarketplaceRegistrationDialogProps) {
  const [channelAccountId, setChannelAccountId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelPrice, setChannelPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    setChannelAccountId((current) => current || accounts[0]?.id || '');
  }, [accounts, open]);

  if (!open) return null;

  const canSubmit = Boolean(channelAccountId && externalId.trim()) && !isSubmitting;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-base font-black text-slate-900">마켓 등록</h2>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 계정
            <select
              value={channelAccountId}
              onChange={(event) => setChannelAccountId(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.channel}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 상품번호
            <input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 상품명
            <input
              value={channelName}
              onChange={(event) => setChannelName(event.target.value)}
              placeholder="비워두면 재고 상품명을 사용합니다"
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            마켓 판매가
            <input
              type="number"
              min={0}
              value={channelPrice}
              onChange={(event) => setChannelPrice(event.target.value)}
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit({
              channelAccountId,
              externalId: externalId.trim(),
              channelName: channelName.trim() || null,
              channelPrice: channelPrice.trim() ? Number(channelPrice) : null,
            })}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {isSubmitting ? '처리 중...' : '마켓 등록 완료 처리'}
          </button>
        </div>
      </div>
    </div>
  );
}
