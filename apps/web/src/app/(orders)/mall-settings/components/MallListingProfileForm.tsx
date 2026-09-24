'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { MALL_LISTING_PROFILE_FIELDS } from '@kiditem/shared/channel-account';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { orderMallAccountApi, type OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import {
  listingProfileUpdateFromEdits,
  storedListingProfileValues,
  type ListingProfileKey,
} from '../lib/mall-listing-profile-draft';

const FIELD = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400';

/**
 * 몰 하나의 등록 기본값(KID-235) — 몰 카드의 "등록 기본값 없음"을 사람이 푸는 자리. 계정 저장과 따로 저장하고,
 * 고친 칸만 보낸다. 필드 · 라벨 · 순서는 서버 문서 정의(`MALL_LISTING_PROFILE_FIELDS`)를 그대로 쓴다.
 */
export function MallListingProfileForm({ account }: { account: OrderCollectionMallAccount }) {
  const queryClient = useQueryClient();
  const stored = useMemo(() => storedListingProfileValues(account.listingProfile), [account.listingProfile]);
  const [edits, setEdits] = useState<Partial<Record<ListingProfileKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const update = listingProfileUpdateFromEdits(stored, edits);
  const dirty = Object.keys(update).length > 0;
  const hasAccountRow = Boolean(account.channelAccountId);

  const save = async () => {
    if (!dirty || !hasAccountRow) return;
    setSaving(true);
    try {
      await orderMallAccountApi.updateListingProfile(account.key, update);
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.collectionMalls() });
      toast.success(`${account.name} 등록 기본값을 저장했습니다.`);
    } catch (error) {
      toast.error(isApiError(error) ? error.detail : `${account.name} 등록 기본값을 저장하지 못했습니다.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="mall-listing-profile-title" className="space-y-3 border-t border-slate-100 pt-4">
      <div>
        <h3 id="mall-listing-profile-title" className="text-sm font-semibold text-slate-900">등록 기본값</h3>
        <p className="mt-1 text-xs text-slate-500">
          {hasAccountRow
            ? '이 몰에 상품을 올릴 때 쓰는 기본값입니다. 비운 칸은 저장하면 지워집니다.'
            : '계정을 먼저 저장하면 등록 기본값을 적을 수 있습니다.'}
        </p>
      </div>
      {MALL_LISTING_PROFILE_FIELDS.map((field) => {
        const before = stored[field.key];
        const edit = edits[field.key];
        if (!before.editable && edit === undefined) {
          return (
            <div key={field.key} className="block">
              <span className="text-xs font-medium text-slate-600">{field.label}</span>
              <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {before.json}
                </code>
                <button
                  type="button"
                  onClick={() => setEdits((current) => ({ ...current, [field.key]: '' }))}
                  aria-label={`${field.label} 덮어쓰기`}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  덮어쓰기
                </button>
              </div>
            </div>
          );
        }
        return (
          <label key={field.key} className="block">
            <span className="text-xs font-medium text-slate-600">{field.label}</span>
            <input
              value={edit ?? (before.editable ? before.text : '')}
              onChange={(event) => setEdits((current) => ({ ...current, [field.key]: event.target.value }))}
              aria-label={field.label}
              autoComplete="off"
              className={`mt-1 ${FIELD}`}
            />
          </label>
        );
      })}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || !hasAccountRow || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          등록 기본값 저장
        </button>
      </div>
    </section>
  );
}
