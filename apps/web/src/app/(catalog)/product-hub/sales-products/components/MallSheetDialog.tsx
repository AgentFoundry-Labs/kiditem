'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SalesProductMallSheet, SalesProductMallSheetCheck } from '@kiditem/shared/sales-product';
import { downloadBlob } from '@/lib/browser-download';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { mallSheetCategoryGroups, readStoredFixed, storeFixed, type MallSheetCategoryGroup } from '../lib/mall-sheet';

const MALL_LABEL: Record<string, string> = {
  gmarket: 'G마켓',
  auction: '옥션',
  '11st': '11번가',
  coupang: '쿠팡',
  kidsnote: '키즈노트',
};

/**
 * 몰 대량등록 엑셀 — 판매상품으로 몰마다 다른 대량등록 양식을 채워 내려받는다. 여기서는 몰에 아무것도 보내지 않는다.
 * 사람이 파일을 몰 판매자센터에 올린다.
 *
 * 먼저 "이 몰에 없는 판매상품"을 확인하고, 분류가 없어 막힌 상품은 다른 몰 분류로 짐작한 추천을 확인해 저장한 뒤
 * 넣을 수 있는 상품만 골라 받는다.
 */
export function MallSheetDialog({ onClose }: { onClose: () => void }) {
  const sheets = useQuery({ queryKey: salesProductKeys.mallSheets(), queryFn: salesProductApi.mallSheets });
  const [sheetKey, setSheetKey] = useState('esm');
  const [fixedBySheet, setFixedBySheet] = useState<Record<string, Record<string, string>>>(() => readStoredFixed());
  const [check, setCheck] = useState<SalesProductMallSheetCheck | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const sheet = sheets.data?.sheets.find((item) => item.sheetKey === sheetKey) ?? sheets.data?.sheets[0] ?? null;
  const fixed = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of sheet?.fixedFields ?? []) values[field.key] = fixedBySheet[sheet!.sheetKey]?.[field.key] ?? field.defaultValue;
    return values;
  }, [sheet, fixedBySheet]);

  const runCheck = useMutation({
    mutationFn: () => salesProductApi.checkMallSheet(sheet!.sheetKey, { fixed }),
    onSuccess: (result) => {
      setCheck(result);
      setSelected(new Set(result.products.filter((product) => product.problems.length === 0).map((product) => product.salesProductId)));
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '몰 엑셀을 확인하지 못했습니다.'),
  });

  const assign = useMutation({
    mutationFn: (group: { mallKey: string; path: string; salesProductIds: string[] }) => salesProductApi.assignMallCategory(group),
    onSuccess: (result, group) => {
      toast.success(`${MALL_LABEL[group.mallKey] ?? group.mallKey} 분류를 ${group.salesProductIds.length}개에 저장했습니다${
        sheet?.categoryBy === 'code' && !result.code ? ' — 이 경로는 몰 번호로 바뀌지 않아 여전히 막힙니다' : ''}`);
      runCheck.mutate();
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : '분류를 저장하지 못했습니다.'),
  });

  const download = useMutation({
    mutationFn: async () => {
      const ids = check!.products.map((product) => product.salesProductId).filter((id) => selected.has(id));
      const size = sheet!.maxProducts;
      for (let start = 0; start < ids.length; start += size) {
        const { blob, fileName } = await salesProductApi.downloadMallSheet(sheet!.sheetKey, {
          salesProductIds: ids.slice(start, start + size),
          fixed,
        });
        downloadBlob(blob, fileName);
      }
      return Math.ceil(ids.length / size);
    },
    onSuccess: (files) => toast.success(`${sheet!.label} 엑셀 ${files}개를 받았습니다. 몰 판매자센터에 올려 주세요.`),
    onError: (error) => toast.error(isApiError(error) ? error.detail : '몰 엑셀을 만들지 못했습니다.'),
  });

  const chooseSheet = (next: string) => {
    setSheetKey(next);
    setCheck(null);
    setSelected(new Set());
  };
  const setFixedValue = (key: string, value: string) => {
    const next = { ...fixedBySheet, [sheet!.sheetKey]: { ...fixed, [key]: value } };
    setFixedBySheet(next);
    storeFixed(next);
  };

  const readyIds = check?.products.filter((product) => product.problems.length === 0).map((product) => product.salesProductId) ?? [];
  const chosen = readyIds.filter((id) => selected.has(id)).length;
  const files = sheet ? Math.ceil(chosen / sheet.maxProducts) : 0;
  const groups = check && sheet ? mallSheetCategoryGroups(check, sheet) : [];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="몰 대량등록 엑셀">
      <div className="flex max-h-[90vh] w-[880px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">몰 대량등록 엑셀</h2>
            <p className="mt-1 text-sm text-slate-500">
              판매상품으로 몰마다 다른 대량등록 양식을 채워 내려받습니다. 여기서는 몰에 아무것도 보내지 않습니다 — 받은 파일을 몰 판매자센터에 올려 주세요.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6 pt-4">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="몰">
            {(sheets.data?.sheets ?? []).map((item) => (
              <button
                key={item.sheetKey}
                type="button"
                role="tab"
                aria-selected={item.sheetKey === sheet?.sheetKey}
                className={cn('tab', item.sheetKey === sheet?.sheetKey ? 'tab-active' : 'tab-inactive')}
                onClick={() => chooseSheet(item.sheetKey)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {sheets.isError && <p className="text-sm text-red-600">몰 엑셀 목록을 읽지 못했습니다.</p>}

          {sheet && (
            <>
              <ul className="space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {sheet.notes.map((note) => <li key={note}>· {note}</li>)}
              </ul>
              <FixedFields sheet={sheet} values={fixed} onChange={setFixedValue} />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-1.5"
                  disabled={runCheck.isPending}
                  onClick={() => runCheck.mutate()}
                >
                  <FileSpreadsheet size={16} aria-hidden />
                  {runCheck.isPending ? '확인하는 중…' : `${sheet.label}에 없는 판매상품 확인`}
                </button>
                <span className="text-xs text-slate-500">
                  몰 상품과 이어지지 않았고 사방넷이 이 몰에 보낸 적도 없는 판매중 상품을 고릅니다.
                </span>
              </div>
            </>
          )}

          {check && sheet && (
            <CheckResult
              check={check}
              sheet={sheet}
              groups={groups}
              selected={selected}
              onToggle={(id) => setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })}
              onToggleAll={(on) => setSelected(on ? new Set(readyIds) : new Set())}
              onAssign={(group, path) => assign.mutate({ mallKey: group.mallKey, path, salesProductIds: group.salesProductIds })}
              assigning={assign.isPending}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <p className="text-sm text-slate-500">
            {check ? <>고른 상품 <b className="tabular-nums text-slate-800">{chosen}</b>개{files > 1 ? ` · 파일 ${files}개로 나눠 받습니다` : ''}</> : '먼저 확인을 눌러 주세요.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>닫기</button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
              disabled={!check || chosen === 0 || check.missingFixed.length > 0 || download.isPending}
              onClick={() => download.mutate()}
            >
              <Download size={16} aria-hidden />
              {download.isPending ? '만드는 중…' : '엑셀 받기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FixedFields({
  sheet,
  values,
  onChange,
}: {
  sheet: SalesProductMallSheet;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const changed = sheet.fixedFields.filter((field) => values[field.key] !== field.defaultValue).length;
  return (
    <details className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-slate-700">
        몰 고정값 {sheet.fixedFields.length}개
        <span className="ml-2 font-normal text-slate-500">
          {changed > 0 ? `${changed}개 바꿈 · 이 브라우저에 기억합니다` : '키드아이템 계정에서 읽은 값이 들어 있습니다'}
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
        {sheet.fixedFields.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="font-medium text-slate-700">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </span>
            <input
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
            />
            {field.help && <span className="mt-0.5 block text-xs text-slate-500">{field.help}</span>}
          </label>
        ))}
      </div>
    </details>
  );
}

function CheckResult({
  check,
  sheet,
  groups,
  selected,
  onToggle,
  onToggleAll,
  onAssign,
  assigning,
}: {
  check: SalesProductMallSheetCheck;
  sheet: SalesProductMallSheet;
  groups: MallSheetCategoryGroup[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  onAssign: (group: MallSheetCategoryGroup, path: string) => void;
  assigning: boolean;
}) {
  const ready = check.products.filter((product) => product.problems.length === 0);
  const allOn = ready.length > 0 && ready.every((product) => selected.has(product.salesProductId));
  return (
    <section aria-label="확인 결과" className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>이 몰에 없는 판매상품 <b className="tabular-nums">{check.products.length}</b>개</span>
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <CheckCircle2 size={14} aria-hidden /> 넣을 수 있음 <b className="tabular-nums">{check.ready}</b>
        </span>
        <span className="inline-flex items-center gap-1 text-amber-700">
          <AlertTriangle size={14} aria-hidden /> 막힘 <b className="tabular-nums">{check.blocked}</b>
        </span>
      </div>
      {check.maybeListed > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          사방넷이 이 몰에 보낸 적이 있어 뺀 판매상품이 {check.maybeListed}개 있습니다. 몰에 이미 올라가 있을 수 있어 다시 올리면 같은 상품이 둘 생깁니다.
        </p>
      )}
      {check.missingFixed.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">비어 있는 고정값: {check.missingFixed.join(', ')}</p>
      )}

      {groups.length > 0 && <CategoryGroups sheet={sheet} groups={groups} onAssign={onAssign} assigning={assigning} />}

      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" aria-label="넣을 수 있는 상품 모두 고르기" checked={allOn} onChange={(event) => onToggleAll(event.target.checked)} />
              </th>
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">상품명</th>
              <th className="px-3 py-2">엑셀</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...ready, ...check.products.filter((product) => product.problems.length > 0)].map((product) => {
              const blocked = product.problems.length > 0;
              return (
                <tr key={product.salesProductId} className={blocked ? 'bg-amber-50/40' : undefined}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${product.code} 고르기`}
                      disabled={blocked}
                      checked={selected.has(product.salesProductId)}
                      onChange={() => onToggle(product.salesProductId)}
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">{product.code}</td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-slate-800" title={product.name}>{product.name}</td>
                  <td className="px-3 py-2 text-xs">
                    {blocked ? (
                      <span className="text-amber-800" title={product.problems.join('\n')}>{product.problems[0]}</span>
                    ) : (
                      <span className="text-emerald-700" title={product.warnings.join('\n')}>
                        {product.rows}줄{product.warnings.length > 0 ? ` · 확인할 것 ${product.warnings.length}` : ''}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {check.products.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">이 몰에 없는 판매상품이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryGroups({
  sheet,
  groups,
  onAssign,
  assigning,
}: {
  sheet: SalesProductMallSheet;
  groups: MallSheetCategoryGroup[];
  onAssign: (group: MallSheetCategoryGroup, path: string) => void;
  assigning: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-100 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-700">분류가 없어 막힌 상품</p>
        <p className="mt-0.5 text-xs text-slate-500">
          같은 상품이 다른 몰에서 쓰는 분류로 이 몰 분류를 짐작했습니다. 짐작이라 틀릴 수 있어요 — 확인하고 고쳐서 저장하면 판매상품 몰별 값에 남습니다.
          {sheet.categoryBy === 'code' ? ' 이 몰은 분류 번호로 받아, 몰 분류표에 있는 경로여야 합니다.' : ''}
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {groups.map((group) => (
          <CategoryGroupRow key={`${group.mallKey}|${group.suggestion ?? ''}`} group={group} onAssign={onAssign} assigning={assigning} />
        ))}
      </ul>
    </div>
  );
}

function CategoryGroupRow({
  group,
  onAssign,
  assigning,
}: {
  group: MallSheetCategoryGroup;
  onAssign: (group: MallSheetCategoryGroup, path: string) => void;
  assigning: boolean;
}) {
  const [path, setPath] = useState(group.suggestion ?? '');
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 font-medium text-slate-700">{MALL_LABEL[group.mallKey] ?? group.mallKey}</span>
      <span className="w-20 shrink-0 tabular-nums text-slate-500">{group.salesProductIds.length}개</span>
      {group.suggestion ? (
        <>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            aria-label={`${MALL_LABEL[group.mallKey] ?? group.mallKey} 분류 경로`}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          <span className={cn('shrink-0 text-xs', group.resolves ? 'text-slate-500' : 'text-amber-700')}>
            {group.resolves ? `짐작 ${Math.round(group.share * 100)}%` : '번호 없음'}
          </span>
          <button
            type="button"
            className="btn-secondary btn-sm shrink-0"
            disabled={!path.trim() || assigning}
            onClick={() => onAssign(group, path.trim())}
          >
            이 {group.salesProductIds.length}개에 저장
          </button>
        </>
      ) : (
        <span className="min-w-0 flex-1 text-slate-500">
          추천이 없습니다 — 다른 몰 분류가 없는 상품이라 판매상품 편집의 몰별 값에서 하나씩 정해 주세요.
        </span>
      )}
      </div>
      <details className="mt-1 pl-[9.5rem] text-xs text-slate-500">
        <summary className="cursor-pointer">상품 보기</summary>
        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
          {group.names.map((name) => <li key={name}>{name}</li>)}
        </ul>
      </details>
    </li>
  );
}
