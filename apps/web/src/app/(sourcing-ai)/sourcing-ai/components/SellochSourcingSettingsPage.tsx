'use client';

import { useEffect, useState } from 'react';
import { Layers, Plus, RefreshCw, Tag, Trash2, type LucideIcon } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  addSourcingInterestTarget,
  createCategoryInterestTarget,
  createKeywordInterestTarget,
  loadLatestInterestTrackingPayload,
  removeSourcingInterestTarget,
  type SourcingInterestTarget,
  type SourcingInterestTrackingSnapshotPayload,
} from '../lib/sourcing-interest-tracking';

export function SellochSourcingSettingsPage() {
  const [payload, setPayload] = useState<SourcingInterestTrackingSnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const targets = payload?.result.targets ?? [];
  const keywordTargets = targets.filter((target) => target.type === 'keyword');
  const categoryTargets = targets.filter((target) => target.type === 'category');

  const refresh = () => {
    setLoading(true);
    void loadLatestInterestTrackingPayload(3)
      .then((nextPayload) => setPayload(nextPayload))
      .catch(() => setNotice('소싱 설정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const addKeyword = async () => {
    const keyword = keywordInput.trim();
    if (!keyword) return;
    setSaving(true);
    try {
      const nextPayload = await addSourcingInterestTarget({
        target: createKeywordInterestTarget({ keyword, source: 'manual' }),
        observation: { source: 'manual', note: '소싱 설정에서 직접 등록' },
      });
      setPayload(nextPayload);
      setKeywordInput('');
      setNotice('관심 키워드를 저장했습니다.');
    } catch {
      setNotice('관심 키워드 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    const category = categoryInput.trim();
    if (!category) return;
    setSaving(true);
    try {
      const nextPayload = await addSourcingInterestTarget({
        target: createCategoryInterestTarget({ category, source: 'manual' }),
        observation: { source: 'manual', note: '소싱 설정에서 직접 등록' },
      });
      setPayload(nextPayload);
      setCategoryInput('');
      setNotice('관심 카테고리를 저장했습니다.');
    } catch {
      setNotice('관심 카테고리 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const removeTarget = async (target: SourcingInterestTarget) => {
    setSaving(true);
    try {
      const nextPayload = await removeSourcingInterestTarget({ targetId: target.id });
      setPayload(nextPayload);
      setNotice(`${target.label} 설정을 삭제했습니다.`);
    } catch {
      setNotice('소싱 설정 삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-full bg-transparent text-[#171923]">
      <div className="flex w-full flex-col gap-6 px-8 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            <h1 className="text-3xl font-black tracking-normal text-[#111827]">소싱 설정</h1>
            <p className="mt-2 text-sm font-bold text-[#667085]">소싱 에이전트가 참고할 관심 키워드와 카테고리를 관리합니다.</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading || saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dbe5f4] bg-white px-4 text-xs font-black text-[#667085] disabled:opacity-60"
          >
            <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
            새로고침
          </button>
        </header>

        {notice && (
          <p className="rounded-xl border border-[#e3eaf5] bg-white px-4 py-3 text-xs font-black text-[#5b52e6]">{notice}</p>
        )}

        <section className="grid gap-5 xl:grid-cols-2">
          <SettingGroup
            icon={Tag}
            title="관심 키워드"
            count={keywordTargets.length}
            placeholder="예: 포켓몬카드"
            value={keywordInput}
            onValueChange={setKeywordInput}
            onAdd={addKeyword}
            disabled={loading || saving}
            targets={keywordTargets}
            onRemove={removeTarget}
          />
          <SettingGroup
            icon={Layers}
            title="관심 카테고리"
            count={categoryTargets.length}
            placeholder="예: 완구/슬라임"
            value={categoryInput}
            onValueChange={setCategoryInput}
            onAdd={addCategory}
            disabled={loading || saving}
            targets={categoryTargets}
            onRemove={removeTarget}
          />
        </section>
      </div>
    </main>
  );
}

function SettingGroup({
  icon: Icon,
  title,
  count,
  placeholder,
  value,
  onValueChange,
  onAdd,
  disabled,
  targets,
  onRemove,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  onAdd: () => void;
  disabled: boolean;
  targets: SourcingInterestTarget[];
  onRemove: (target: SourcingInterestTarget) => void;
}) {
  return (
    <section className="rounded-[22px] border border-[#dbe5f4] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f2f5ff] text-[#5b52e6]">
            <Icon size={18} />
          </span>
          <div>
            <h2 className="text-base font-black text-[#111827]">{title}</h2>
            <p className="text-xs font-bold text-[#8a95a6]">{formatNumber(count)}개 등록됨</p>
          </div>
        </div>
      </div>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onAdd();
        }}
      >
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-[#dbe5f4] bg-[#f8fafc] px-4 text-sm font-bold text-[#111827] outline-none placeholder:text-[#98a2b3]"
          placeholder={placeholder}
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#5b52e6] px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-[#aab2c5]"
        >
          <Plus size={15} />
          추가
        </button>
      </form>

      <div className="mt-5 flex flex-wrap gap-2">
        {targets.length > 0 ? (
          targets.map((target) => (
            <span key={target.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#e3eaf5] bg-[#f8fafc] px-3 py-1.5 text-xs font-black text-[#475467]">
              <span className="truncate">{target.label}</span>
              <button type="button" onClick={() => onRemove(target)} className="text-[#98a2b3] hover:text-red-600" aria-label={`${target.label} 삭제`}>
                <Trash2 size={13} />
              </button>
            </span>
          ))
        ) : (
          <span className="rounded-full border border-dashed border-[#cfd9e8] px-3 py-1.5 text-xs font-black text-[#8a95a6]">
            아직 등록된 설정이 없습니다.
          </span>
        )}
      </div>
    </section>
  );
}
