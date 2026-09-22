'use client';

import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import {
  MALL_VALUE_ORIGIN_LABEL,
  missingRequiredFields,
  type MallPublishAdapter,
  type MallPublishItem,
  type MallValueOrigin,
} from '../../_shared/mall-publish-adapter';
import type { RegistrationTarget } from '@kiditem/shared/sales-product';
import type { PublishBlock } from '../lib/publish-plan';

const PREVIEW_ROWS = 5;

const ORIGIN_TONE: Record<MallValueOrigin, string> = {
  master: 'bg-slate-100 text-slate-500',
  template: 'bg-sky-50 text-sky-700',
  override: 'bg-purple-50 text-purple-700',
};

interface StepValuesProps {
  adapters: MallPublishAdapter[];
  items: MallPublishItem[];
  activeMallKey: string;
  valuesByMall: Record<string, Record<string, string>>;
  blocks: PublishBlock[];
  onSelectMall: (mallKey: string) => void;
  onChangeValue: (mallKey: string, fieldKey: string, value: string) => void;
  channelAccountId: string | null;
  registrationTargetsByItem: Readonly<Record<string, readonly RegistrationTarget[]>>;
  selectedRegistrationTargetIds: Readonly<Record<string, string>>;
  onSelectRegistrationTarget: (candidateId: string, targetId: string) => void;
}

/**
 * 3단계 — 몰별 값 확인.
 *
 * 같은 상품이라도 몰마다 다른 값이 들어간다. 지금까지 그 값들은 TypeScript 상수로
 * 코드에 박혀 있어 무엇이 나가는지 화면에서 볼 수 없었다. 여기서 출처를 함께
 * 보여준다 — `상품`(마스터에서 옴) / `몰 고정`(이 몰에서 늘 같음) / `이번 송신`.
 *
 * 업계 3층 모델 그대로다. 지금은 이번 송신 값이 화면 상태에만 남지만, 저장할 곳은
 * 이미 있다(`MallListingProfile`).
 */
export function StepValues({
  adapters,
  items,
  activeMallKey,
  valuesByMall,
  blocks,
  onSelectMall,
  onChangeValue,
  channelAccountId,
  registrationTargetsByItem,
  selectedRegistrationTargetIds,
  onSelectRegistrationTarget,
}: StepValuesProps) {
  const active = adapters.find((adapter) => adapter.mallKey === activeMallKey) ?? adapters[0];
  if (!active) return null;

  const values = valuesByMall[active.mallKey] ?? {};
  const missing = missingRequiredFields(active, values);
  const mallBlocks = blocks.filter((block) => block.mallKey === active.mallKey);
  const previewItems = items.slice(0, PREVIEW_ROWS);
  const headers = previewItems[0] ? active.preview(previewItems[0], values) : [];
  const targetChoices = active.mode === 'form' && channelAccountId
    ? items.flatMap((item) => {
      const targets = (registrationTargetsByItem[item.candidateId] ?? [])
        .filter((target) => target.channelAccountId === channelAccountId);
      return targets.length > 1 ? [{ item, targets }] : [];
    })
    : [];

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
      <nav className="space-y-1.5" aria-label="몰 선택">
        {adapters.map((adapter) => {
          const adapterValues = valuesByMall[adapter.mallKey] ?? {};
          const missingCount = missingRequiredFields(adapter, adapterValues).length;
          const blockCount = blocks.filter((block) => block.mallKey === adapter.mallKey).length;
          return (
            <button
              key={adapter.mallKey}
              type="button"
              onClick={() => onSelectMall(adapter.mallKey)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition',
                adapter.mallKey === active.mallKey
                  ? 'border-purple-300 bg-purple-50 font-medium text-purple-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="truncate">{adapter.mallName}</span>
              {missingCount > 0 ? (
                <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">
                  {missingCount}
                </span>
              ) : blockCount > 0 ? (
                <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                  {blockCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{active.mallName} 값</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {active.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  {field.label}
                  <span className={cn('rounded px-1 py-0.5 text-[10px] font-normal', ORIGIN_TONE[field.origin])}>
                    {MALL_VALUE_ORIGIN_LABEL[field.origin]}
                  </span>
                </span>
                {field.control === 'select' ? (
                  <select
                    value={values[field.key] ?? ''}
                    onChange={(event) => onChangeValue(active.mallKey, field.key, event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm outline-none focus:border-purple-400"
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {option.hint ? ` — ${option.hint}` : ''}
                      </option>
                    ))}
                  </select>
                ) : field.key === CATEGORY_FIELD_KEY ? (
                  <CategoryPathInput
                    mallKey={active.mallKey}
                    value={values[field.key] ?? ''}
                    required={field.required}
                    onChange={(value) => onChangeValue(active.mallKey, field.key, value)}
                  />
                ) : (
                  <input
                    value={values[field.key] ?? ''}
                    onChange={(event) => onChangeValue(active.mallKey, field.key, event.target.value)}
                    className={cn(
                      'mt-1 w-full rounded-md border px-2 py-2 text-sm outline-none focus:border-purple-400',
                      field.required && !(values[field.key] ?? '').trim()
                        ? 'border-red-300'
                        : 'border-slate-200',
                    )}
                  />
                )}
                {field.help ? (
                  <span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{field.help}</span>
                ) : null}
              </label>
            ))}
          </div>
          {missing.length > 0 ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle size={13} />
              {missing.map((field) => field.label).join(', ')} 을(를) 채워야 보낼 수 있습니다.
            </p>
          ) : null}
        </div>

        {targetChoices.length > 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label={`${active.mallName} 등록 설정`}>
            <h3 className="text-sm font-semibold text-slate-900">기존 등록 설정</h3>
            <p className="mt-1 text-xs text-slate-500">
              같은 계정에 저장된 설정이 여러 개인 상품만 사용할 설정을 골라 주세요.
            </p>
            <div className="mt-3 space-y-3">
              {targetChoices.map(({ item, targets }) => (
                <label key={item.candidateId} className="block">
                  <span className="block text-xs font-medium text-slate-700">{item.name}</span>
                  <select
                    aria-label={`${item.name} 등록 설정`}
                    required
                    value={selectedRegistrationTargetIds[item.candidateId] ?? ''}
                    onChange={(event) => onSelectRegistrationTarget(item.candidateId, event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm outline-none focus:border-purple-400"
                  >
                    <option value="">등록 설정을 선택하세요</option>
                    {targets.map((target, index) => (
                      <option key={target.id} value={target.id}>
                        등록 설정 {index + 1} · {target.displayName || target.resolved.name} · 옵션 {target.selectedOptions.length}개
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {headers.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-xs font-semibold text-slate-700">
                {active.mallName}에 들어갈 값
                <span className="ml-2 font-normal text-slate-400">
                  {items.length}건 중 {previewItems.length}건 표시
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="border-b border-slate-100 text-left text-slate-500">
                  <tr>
                    {headers.map((header) => (
                      <th key={header.label} className="px-3 py-2 font-medium">
                        <span className="flex items-center gap-1">
                          {header.label}
                          {header.mallSpecific ? (
                            <span
                              title="이 몰에서만 이 모양으로 들어갑니다"
                              className="h-1 w-1 rounded-full bg-purple-400"
                            />
                          ) : null}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {previewItems.map((item) => (
                    <tr key={item.candidateId}>
                      {active.preview(item, values).map((row) => (
                        <td key={row.label} className="px-3 py-2 align-top text-slate-700">
                          <span className="line-clamp-2">{row.value}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {mallBlocks.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <Ban size={13} />
              {active.mallName}로 보낼 수 없는 상품 {mallBlocks.length}건
            </h3>
            <ul className="mt-2 space-y-1">
              {mallBlocks.slice(0, 8).map((block) => (
                <li key={block.candidateId} className="text-[11px] leading-relaxed text-amber-800">
                  <span className="font-medium">{block.productName}</span> — {block.reasons.join(' ')}
                </li>
              ))}
              {mallBlocks.length > 8 ? (
                <li className="text-[11px] text-amber-700">외 {mallBlocks.length - 8}건</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** 어댑터가 분류 경로를 받는 칸 이름. 몰마다 같은 이름을 쓴다(`>` 로 잇는 경로). */
const CATEGORY_FIELD_KEY = 'categoryPath';

/**
 * 분류 칸 — 이 몰에서 판매상품이 쓰던 분류(사방넷 송신 기록에서 옮긴 것)를 많이 쓴 순으로 고를거리로 보인다.
 * 고르지 않고 직접 적어도 된다. 값을 대신 채우지는 않는다.
 */
function CategoryPathInput({
  mallKey,
  value,
  required,
  onChange,
}: {
  mallKey: string;
  value: string;
  required: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const suggestions = useQuery({
    queryKey: salesProductKeys.mallCategories(mallKey),
    queryFn: () => salesProductApi.mallCategories(mallKey),
    staleTime: 5 * 60_000,
  });
  const categories = suggestions.data?.categories ?? [];
  return (
    <>
      <input
        value={value}
        list={categories.length > 0 ? listId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'mt-1 w-full rounded-md border px-2 py-2 text-sm outline-none focus:border-purple-400',
          required && !value.trim() ? 'border-red-300' : 'border-slate-200',
        )}
      />
      {categories.length > 0 ? (
        <>
          <datalist id={listId}>
            {categories.map((category) => (
              <option key={category.path} value={category.path}>
                {category.title ? `${category.title} · ` : ''}{category.count}개 상품
              </option>
            ))}
          </datalist>
          <span className="mt-1 block text-[11px] text-purple-700">
            사방넷에서 쓰던 분류 {categories.length}개 — 칸을 누르면 고를 수 있습니다.
          </span>
        </>
      ) : null}
    </>
  );
}
