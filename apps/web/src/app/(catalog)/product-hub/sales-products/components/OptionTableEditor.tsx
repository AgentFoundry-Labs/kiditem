'use client';

import { useState } from 'react';
import { Link2, Plus, Trash2, Wand2, X } from 'lucide-react';
import { SALES_PRODUCT_MAX_OPTION_AXES } from '@kiditem/shared/sales-product';
import { cn } from '@/lib/utils';
import {
  addMissingCombinations,
  emptyRow,
  setAxes,
  type OptionRowDraft,
  type OptionTableDraft,
} from '../lib/sales-product-draft';
import { formatWon, OPTION_SUPPLY_LABEL, OPTION_SUPPLY_TONE } from '../lib/sales-product-labels';
import { SellpiaSkuPicker } from './SellpiaSkuPicker';

/** 화면은 사방넷 엑셀처럼 두 단까지. 계약은 셋까지 받는다. */
const UI_MAX_AXES = Math.min(2, SALES_PRODUCT_MAX_OPTION_AXES);

/**
 * 옵션표(단품) — 사방넷 신규등록의 '단품(옵션)정보'.
 *
 * 1. 옵션 이름(색상 · 사이즈)과 값(쉼표로 여러 개)을 적고 '조합 만들기'를 누르면 없는 조합만 더한다.
 * 2. 줄마다 셀피아 상품을 이으면 그 재고가 보이고, 몰에 보낼 때 품절 · 재고가 이 줄을 따른다.
 * 3. 몰 옵션에 연결된 줄은 지우지 않는다 — 지우면 '미사용'으로 남는다.
 */
export function OptionTableEditor({
  value,
  salePrice,
  skuSearchHint,
  onChange,
}: {
  value: OptionTableDraft;
  salePrice: number;
  /** 셀피아 상품 찾기 첫 검색어 — 모델명의 셀피아 상품번호(`10333-1` → `10333`). */
  skuSearchHint: string;
  onChange: (next: OptionTableDraft) => void;
}) {
  const [axisValues, setAxisValues] = useState<string[]>(() =>
    value.axes.map((_, index) => [...new Set(value.rows.map((row) => row.values[index]).filter(Boolean))].join(', ')));
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const single = value.axes.length === 0;

  const updateRow = (rowKey: string, patch: Partial<OptionRowDraft>) =>
    onChange({ ...value, rows: value.rows.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)) });

  const removeRow = (row: OptionRowDraft) => {
    if (row.linkedChannelOptionCount > 0) {
      updateRow(row.rowKey, { supplyStatus: 'unused' });
      return;
    }
    onChange({ ...value, rows: value.rows.filter((item) => item.rowKey !== row.rowKey) });
  };

  const changeAxisName = (index: number, name: string) => {
    onChange({ ...value, axes: value.axes.map((axis, at) => (at === index ? name : axis)) });
  };

  const addAxis = () => {
    const next = setAxes(value, [...value.axes, value.axes.length === 0 ? '색상' : '사이즈']);
    setAxisValues((current) => [...current, '']);
    onChange(next);
  };

  const removeAxis = (index: number) => {
    const axes = value.axes.filter((_, at) => at !== index);
    setAxisValues((current) => current.filter((_, at) => at !== index));
    onChange(setAxes({
      ...value,
      rows: value.rows.map((row) => ({ ...row, values: row.values.filter((_, at) => at !== index) })),
    }, axes));
  };

  const makeCombinations = () => {
    const lists = axisValues.map((text) => text.split(',').map((part) => part.trim()).filter(Boolean));
    let draft = value;
    // 처음 조합을 만들 때 값이 빈 자리 줄(단품에서 옮겨 온 한 줄)은 첫 조합으로 채운다.
    const blank = draft.rows.find((row) => row.values.every((item) => !item.trim()));
    if (blank && lists.every((list) => list.length > 0)) {
      draft = {
        ...draft,
        rows: draft.rows.map((row) => (row === blank ? { ...row, values: lists.map((list) => list[0]!) } : row)),
      };
    }
    onChange(addMissingCombinations(draft, lists));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">
            {single ? '옵션 없음 — 단품 하나로 팝니다' : `옵션 ${value.axes.length}단 · ${value.rows.length}줄`}
          </p>
          {value.axes.length < UI_MAX_AXES && (
            <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1" onClick={addAxis}>
              <Plus size={14} aria-hidden />
              {single ? '옵션 만들기' : '옵션 단 더하기'}
            </button>
          )}
        </div>
        {!single && (
          <div className="mt-3 space-y-2">
            {value.axes.map((axis, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  {index + 1}단 이름
                  <input
                    value={axis}
                    onChange={(event) => changeAxisName(index, event.target.value)}
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                    aria-label={`${index + 1}단 옵션 이름`}
                  />
                </label>
                <label className="flex min-w-[280px] flex-1 items-center gap-1.5 text-xs text-slate-500">
                  값
                  <input
                    value={axisValues[index] ?? ''}
                    onChange={(event) => setAxisValues((current) =>
                      current.map((text, at) => (at === index ? event.target.value : text)))}
                    placeholder="빨강, 파랑, 노랑"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                    aria-label={`${index + 1}단 옵션 값`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeAxis(index)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                  aria-label={`${index + 1}단 옵션 지우기`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1" onClick={makeCombinations}>
              <Wand2 size={14} aria-hidden />
              조합 만들기
            </button>
            <p className="text-xs text-slate-500">이미 있는 줄은 그대로 두고 없는 조합만 더합니다. 옵션 값에 : | ^ &lt; &gt; 는 쓸 수 없습니다.</p>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-32 px-3 py-2 text-left font-semibold">단품코드</th>
              {value.axes.map((axis, index) => (
                <th key={index} className="px-2 py-2 text-left font-semibold">{axis || `${index + 1}단`}</th>
              ))}
              {single && <th className="px-2 py-2 text-left font-semibold">옵션</th>}
              <th className="w-64 px-2 py-2 text-left font-semibold">셀피아 상품</th>
              <th className="w-16 px-2 py-2 text-right font-semibold">재고</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">추가금액</th>
              <th className="w-24 px-2 py-2 text-right font-semibold">몰 판매가</th>
              <th className="w-36 px-2 py-2 text-left font-semibold">바코드</th>
              <th className="w-24 px-2 py-2 text-center font-semibold">상태</th>
              <th className="w-10 px-2 py-2" aria-label="지우기" />
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row) => {
              const component = row.components[0];
              return (
                <tr key={row.rowKey} className={cn('border-b border-slate-100', row.supplyStatus === 'unused' && 'bg-slate-50 text-slate-400')}>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{row.optionCode ?? '새 단품'}</td>
                  {value.axes.map((_, index) => (
                    <td key={index} className="px-2 py-1.5">
                      <input
                        value={row.values[index] ?? ''}
                        onChange={(event) => updateRow(row.rowKey, {
                          values: row.values.map((item, at) => (at === index ? event.target.value : item)),
                        })}
                        className="w-full min-w-[90px] rounded border border-slate-200 px-2 py-1 text-sm"
                        aria-label={`${row.optionCode ?? '새 단품'} ${value.axes[index]}`}
                      />
                    </td>
                  ))}
                  {single && <td className="px-2 py-1.5 text-slate-400">단품</td>}
                  <td className="relative px-2 py-1.5">
                    {component ? (
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-slate-800" title={`${component.sellpiaCode} ${component.name} ${component.optionName ?? ''}`}>
                          <span className="font-mono text-xs text-slate-500">{component.sellpiaCode}</span>{' '}
                          {component.optionName ?? component.name}
                          {component.quantity > 1 ? ` ×${component.quantity}` : ''}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-xs text-slate-400 hover:text-slate-700"
                          onClick={() => setPickerRow(row.rowKey)}
                        >
                          바꾸기
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        onClick={() => setPickerRow(row.rowKey)}
                      >
                        <Link2 size={12} aria-hidden />
                        셀피아 상품 잇기
                      </button>
                    )}
                    {pickerRow === row.rowKey && (
                      <SellpiaSkuPicker
                        initialSearch={component?.sellpiaCode.split('-')[0] ?? skuSearchHint}
                        title={[row.optionCode, ...row.values].filter(Boolean).join(' ')}
                        onClose={() => setPickerRow(null)}
                        onPick={(candidate) => {
                          updateRow(row.rowKey, {
                            barcode: row.barcode || candidate.barcode || '',
                            components: [{
                              sellpiaInventorySkuId: candidate.sellpiaInventorySkuId,
                              quantity: component?.quantity ?? 1,
                              sellpiaCode: candidate.code,
                              name: candidate.name,
                              optionName: candidate.optionName,
                              currentStock: candidate.currentStock,
                            }],
                          });
                          setPickerRow(null);
                        }}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {component?.currentStock ?? '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={row.extraPrice}
                      onChange={(event) => updateRow(row.rowKey, { extraPrice: Math.round(Number(event.target.value) || 0) })}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                      aria-label={`${row.optionCode ?? '새 단품'} 추가금액`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{formatWon(salePrice + row.extraPrice)}</td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.barcode}
                      onChange={(event) => updateRow(row.rowKey, { barcode: event.target.value })}
                      className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
                      aria-label={`${row.optionCode ?? '새 단품'} 바코드`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <select
                      value={row.supplyStatus}
                      onChange={(event) => updateRow(row.rowKey, { supplyStatus: event.target.value as OptionRowDraft['supplyStatus'] })}
                      className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', OPTION_SUPPLY_TONE[row.supplyStatus])}
                      aria-label={`${row.optionCode ?? '새 단품'} 상태`}
                    >
                      {(Object.keys(OPTION_SUPPLY_LABEL) as OptionRowDraft['supplyStatus'][]).map((status) => (
                        <option key={status} value={status}>{OPTION_SUPPLY_LABEL[status]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {!single && (
                      <button
                        type="button"
                        onClick={() => removeRow(row)}
                        title={row.linkedChannelOptionCount > 0 ? '몰에 올라간 옵션이라 지우지 않고 미사용으로 둡니다.' : '이 줄 지우기'}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        aria-label={`${row.optionCode ?? '새 단품'} 지우기`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!single && (
        <button
          type="button"
          className="btn-secondary btn-sm inline-flex items-center gap-1"
          onClick={() => onChange({ ...value, rows: [...value.rows, emptyRow(value.axes.map(() => ''))] })}
        >
          <Plus size={14} aria-hidden />
          줄 하나 더하기
        </button>
      )}
    </div>
  );
}
