'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { MallFieldSpec } from '@/app/(channels)/_shared/mall-publish-adapter';
import { listMallCategories } from '../../../lib/mall-category-api';

/**
 * 몰 분류를 단계별로 고르는 칸.
 *
 * 값은 `1단 > 2단 > 3단 > 4단` 한 문자열이다. 어댑터는 그 문자열만 알면 되고,
 * 몇 단인지·목록이 어디서 오는지는 이 칸이 안다.
 *
 * 목록은 고를 때마다 몰에서 읽는다. 앞 단을 바꾸면 뒤 단은 지운다 — 남겨두면
 * `생활/건강 > 남성신발` 같은 있지도 않은 길이 만들어지고, 그건 몰이 거절한다.
 */
export const CASCADE_SEPARATOR = ' > ';

export function splitCascade(value: string): string[] {
  return value.split('>').map((part) => part.trim()).filter(Boolean);
}

export function joinCascade(parts: readonly string[]): string {
  return parts.filter(Boolean).join(CASCADE_SEPARATOR);
}

export function MallCascadeField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: MallFieldSpec;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const levels = field.cascade?.levels ?? 1;
  const mall = field.cascade?.mall;
  const picked = splitCascade(value);
  const [options, setOptions] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 아직 고를 수 있는 단까지만 목록을 받는다. 뒤 단은 앞이 정해져야 의미가 있다.
  const wanted = Math.min(picked.length, levels - 1);

  useEffect(() => {
    if (!mall || disabled) return;
    let cancelled = false;
    const load = async () => {
      for (let level = 0; level <= wanted; level += 1) {
        if (options[level]) continue;
        setLoading(level);
        try {
          const names = await listMallCategories(mall, picked.slice(0, level));
          if (cancelled) return;
          setOptions((current) => ({ ...current, [level]: names }));
          setError(null);
        } catch (cause) {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : '분류를 불러오지 못했습니다.');
        } finally {
          if (!cancelled) setLoading(null);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
    // 고른 길이 바뀔 때만 다시 읽는다.
  }, [mall, disabled, wanted, value]);

  const pick = (level: number, next: string) => {
    // 앞 단을 바꾸면 뒤 단은 버린다. 남기면 없는 길이 만들어진다.
    const parts = picked.slice(0, level);
    if (next) parts.push(next);
    setOptions((current) => {
      const kept: Record<number, string[]> = {};
      for (const [key, list] of Object.entries(current)) {
        if (Number(key) <= level) kept[Number(key)] = list;
      }
      return kept;
    });
    onChange(joinCascade(parts));
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {Array.from({ length: levels }, (_, level) => {
        const list = options[level] ?? [];
        const ready = level === 0 || picked.length >= level;
        return (
          <select
            key={level}
            value={picked[level] ?? ''}
            onChange={(event) => pick(level, event.target.value)}
            disabled={disabled || !ready || (list.length === 0 && loading !== level)}
            aria-label={`${field.label} ${level + 1}단`}
            title={field.help ?? field.label}
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-3 text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 disabled:opacity-50"
          >
            <option value="">{level + 1}단</option>
            {list.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        );
      })}
      {loading !== null ? <Loader2 size={12} className="animate-spin text-slate-400" /> : null}
      {error ? <span className="text-[11px] font-semibold text-amber-600">{error}</span> : null}
    </div>
  );
}
