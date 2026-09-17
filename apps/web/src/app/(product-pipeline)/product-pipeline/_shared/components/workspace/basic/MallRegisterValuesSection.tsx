'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-error';
import {
  FORM_MALL_ADAPTERS,
  SHARED_MALL_FIELDS,
  editableMallFields,
  mallRegisterReadiness,
  mallRegisterValuesToSave,
  mallRegisterValuesWithDefaults,
  normalizeMallRegisterValues,
  type MallRegisterValues,
} from '@/app/(channels)/_shared/mall-register-values';
import type { MallFieldSpec } from '@/app/(channels)/_shared/mall-publish-adapter';
import type {
  ProductBasics,
  UpdateProductBasicsInput,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { MallCascadeField } from './MallCascadeField';

/**
 * 상품 상세의 몰 등록 정보.
 *
 * 몰마다 사람이 골라야 하는 값(11번가 분류, 도매꾹 최소 구매수량 …)을 **여기서 한 번**
 * 정한다. 그러고 나면 수집상품 목록에서는 버튼만 누르면 된다.
 *
 * 이 카드는 제 저장 버튼을 따로 가진다. 기본정보 `수정` 안에 넣지 않는 이유 —
 * 몰 값은 등록 직전에 자주 고치는데, 그때마다 상품명·가격까지 편집 모드로 열면
 * 손대지 않은 값을 실수로 덮어쓰게 된다.
 *
 * 화면은 몰을 하나도 모른다. 줄도 칸도 어댑터 선언에서 나온다 — 몰을 늘리면
 * 이 카드에 저절로 나타난다.
 */

interface Props {
  basicInfo: ProductBasics | null;
  /** 판매가는 몰 판정에 쓰인다. 0/누락이면 "모른다"로 접는다. */
  salePrice?: number | null;
  productName?: string;
  onCommit?: (input: UpdateProductBasicsInput) => Promise<void> | void;
  readOnly?: boolean;
}

export function MallRegisterValuesSection({
  basicInfo,
  salePrice = null,
  productName = '',
  onCommit,
  readOnly = false,
}: Props) {
  const saved = useMemo(
    () => mallRegisterValuesWithDefaults(
      normalizeMallRegisterValues(
        basicInfo?.mallRegisterValues,
        basicInfo?.mallRegisterShared,
      ),
    ),
    [basicInfo?.mallRegisterValues, basicInfo?.mallRegisterShared],
  );
  const [draft, setDraft] = useState<MallRegisterValues>(saved);
  const [saving, setSaving] = useState(false);

  // 서버 값이 바뀌면(저장 성공·다른 화면 편집) 손대지 않은 초안을 맞춘다.
  useEffect(() => { setDraft(saved); }, [saved]);

  const dirty = useMemo(
    () => JSON.stringify(mallRegisterValuesToSave(draft))
      !== JSON.stringify(mallRegisterValuesToSave(saved)),
    [draft, saved],
  );

  const readiness = useMemo(
    () => mallRegisterReadiness(
      basicInfo
        ? {
          candidateId: 'preview',
          name: basicInfo.name || productName,
          salePrice: basicInfo.salePrice || salePrice || null,
          thumbnailUrl: null,
        }
        : null,
      draft,
    ),
    [basicInfo, productName, salePrice, draft],
  );
  const blockedCount = readiness.filter((row) => !row.ready).length;

  const setMallValue = (mallKey: string, fieldKey: string, value: string) => {
    setDraft((current) => ({
      ...current,
      byMall: {
        ...current.byMall,
        [mallKey]: { ...(current.byMall[mallKey] ?? {}), [fieldKey]: value },
      },
    }));
  };
  const setSharedValue = (fieldKey: string, value: string) => {
    setDraft((current) => ({ ...current, shared: { ...current.shared, [fieldKey]: value } }));
  };

  const save = async () => {
    if (!onCommit) return;
    setSaving(true);
    try {
      await onCommit(mallRegisterValuesToSave(draft));
      toast.success('몰 등록 정보를 저장했어요', {
        description: '수집상품 목록에서 버튼만 누르면 이 값으로 폼이 채워집니다.',
      });
    } catch (error) {
      toast.error(isApiError(error) ? error.detail : '몰 등록 정보 저장에 실패했어요.');
    } finally {
      setSaving(false);
    }
  };

  const editable = !readOnly && Boolean(onCommit);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
            <Store size={15} className="text-emerald-600" />
            몰 등록 정보
          </h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            몰마다 사람이 골라야 하는 값을 여기에 적어 둡니다. 그러면 수집상품 목록에서
            버튼만 눌러 등록할 수 있습니다.
          </p>
        </div>
        {editable ? (
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {saving ? '저장 중' : dirty ? '몰 등록 정보 저장' : '저장됨'}
          </button>
        ) : null}
      </div>

      {blockedCount > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
          <AlertCircle size={13} className="shrink-0" />
          {blockedCount}개 몰이 아직 등록할 수 없습니다. 아래에서 빠진 값을 채우세요.
        </p>
      ) : null}

      {SHARED_MALL_FIELDS.length > 0 ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-black text-slate-500">
            공통 · 한 번만 넣으면 모든 몰에 들어갑니다
          </p>
          <div className="flex flex-wrap gap-2">
            {SHARED_MALL_FIELDS.map((field) => (
              <MallValueField
                key={field.key}
                field={field}
                value={draft.shared[field.key] ?? ''}
                disabled={!editable || saving}
                onChange={(next) => setSharedValue(field.key, next)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {FORM_MALL_ADAPTERS.map((adapter) => {
          const row = readiness.find((entry) => entry.mallKey === adapter.mallKey);
          const fields = editableMallFields(adapter);
          return (
            <div key={adapter.mallKey} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-xs font-black text-slate-800">{adapter.mallName}</p>
                {row?.ready ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                    <Check size={10} />등록 준비됨
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                    값 필요
                  </span>
                )}
              </div>
              {fields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {fields.map((field) => (
                    <MallValueField
                      key={field.key}
                      field={field}
                      value={draft.byMall[adapter.mallKey]?.[field.key] ?? ''}
                      disabled={!editable || saving}
                      onChange={(next) => setMallValue(adapter.mallKey, field.key, next)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-slate-400">
                  이 몰은 따로 채울 값이 없습니다.
                </p>
              )}
              {row && !row.ready ? (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
                  {row.reasons.join(' ')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] font-semibold text-slate-400">
        여기 값은 폼을 채우는 데만 씁니다 · 등록 버튼은 언제나 사람이 몰 화면에서 누릅니다
      </p>
    </section>
  );
}

function MallValueField({
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
  const label = field.required ? `${field.label} *` : field.label;
  const shared =
    'rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 disabled:bg-slate-50 disabled:opacity-70';

  if (field.control === 'cascade') {
    return (
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-[10px] font-black text-slate-500">{label}</span>
        <MallCascadeField field={field} value={value} disabled={disabled} onChange={onChange} />
      </label>
    );
  }

  if (field.control === 'select') {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-black text-slate-500">{label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={field.label}
          title={field.help ?? field.label}
          className={`${shared} w-52`}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  // 분류처럼 긴 값은 넓은 칸을 준다. 좁으면 `대>중>소` 가 잘려 보인다.
  const wide = field.key.toLowerCase().includes('category');
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'min-w-[280px] flex-1' : ''}`}>
      <span className="text-[10px] font-black text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={field.label}
        title={field.help ?? field.label}
        placeholder={field.help ?? field.label}
        className={`${shared} ${wide ? 'w-full' : 'w-32'}`}
      />
    </label>
  );
}
