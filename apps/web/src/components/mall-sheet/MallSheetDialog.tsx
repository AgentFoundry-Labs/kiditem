'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ImageUp, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  SALES_PRODUCT_MALL_SHEET_MAX_IDS,
  type SalesProductMallSheet,
  type SalesProductMallSheetCheck,
} from '@kiditem/shared/sales-product';
import { downloadBlob } from '@/lib/browser-download';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { mallSheetCategoryGroups, readStoredFixed, storeFixed, type MallSheetCategoryGroup } from './mall-sheet';
import { uploadPublicImages, type PublicImageUploadProgress } from './public-image-upload';

const MALL_LABEL: Record<string, string> = {
  gmarket: 'G마켓',
  auction: '옥션',
  '11st': '11번가',
  coupang: '쿠팡',
  kidsnote: '키즈노트',
};

/**
 * 몰 대량등록 엑셀 — 판매상품으로 몰마다 다른 대량등록 양식을 채워 내려받는다. 여기서는 몰에 아무것도 보내지 않는다.
 * 사람이 파일을 몰 판매자센터에 올린다. 판매상품 화면(이 몰에 없는 판매상품)과 수집상품 화면(고른 수집상품으로 만든
 * 판매상품, `salesProductIds`)이 같은 창을 연다.
 *
 * 확인 → 막힌 상품의 분류 추천을 확인해 저장 · 몰이 못 읽는 사진은 [사진 올리기] → 넣을 수 있는 상품만 골라 받는다.
 */
export function MallSheetDialog({
  onClose,
  salesProductIds,
  intro,
}: {
  onClose: () => void;
  /** 이 판매상품들만 본다(수집상품 화면). 없으면 이 몰에 없는 판매상품을 서버가 고른다. */
  salesProductIds?: readonly string[];
  /** 머리 아래 한 줄(수집상품에서 판매상품을 몇 개 만들었는지 등). */
  intro?: ReactNode;
}) {
  const preset = salesProductIds && salesProductIds.length > 0 ? salesProductIds : null;
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
    mutationFn: () => salesProductApi.checkMallSheet(
      sheet!.sheetKey,
      preset ? { fixed, salesProductIds: [...preset] } : { fixed },
    ),
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

  // 수집상품 화면에서 연 창은 상품이 이미 정해져 있다 — 몰을 고르면 바로 확인한다.
  const checkedSheet = useRef<string | null>(null);
  useEffect(() => {
    if (!preset || !sheet || checkedSheet.current === sheet.sheetKey) return;
    checkedSheet.current = sheet.sheetKey;
    runCheck.mutate();
  }, [preset, sheet, runCheck]);

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
            {intro && <div className="mt-2 text-sm text-slate-700">{intro}</div>}
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
                  {runCheck.isPending
                    ? '확인하는 중…'
                    : preset ? `고른 ${preset.length}개 다시 확인` : `${sheet.label}에 없는 판매상품 확인`}
                </button>
                <span className="text-xs text-slate-500">
                  {preset
                    ? '분류 · 사진 · 고정값을 고친 뒤에는 다시 확인을 눌러 주세요.'
                    : '몰 상품과 이어지지 않았고 사방넷이 이 몰에 보낸 적도 없는 판매중 상품을 고릅니다.'}
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
              onImagesUploaded={() => runCheck.mutate()}
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
  onImagesUploaded,
}: {
  check: SalesProductMallSheetCheck;
  sheet: SalesProductMallSheet;
  groups: MallSheetCategoryGroup[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  onAssign: (group: MallSheetCategoryGroup, path: string) => void;
  assigning: boolean;
  onImagesUploaded: () => void;
}) {
  const ready = check.products.filter((product) => product.problems.length === 0);
  const allOn = ready.length > 0 && ready.every((product) => selected.has(product.salesProductId));
  // 사진 올리기는 사진 때문에 막힌 상품만 — 사방넷 사진으로 대신 넣는 상품은 경고로 두고 올리라고 하지 않는다.
  const photoBlockedIds = useMemo(
    () => check.products
      .filter((product) => product.unreadableImages > 0)
      .map((product) => product.salesProductId)
      .slice(0, SALES_PRODUCT_MALL_SHEET_MAX_IDS),
    [check],
  );
  return (
    <section aria-label="확인 결과" className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>
          {check.scope === 'selected' ? '고른 판매상품' : '이 몰에 없는 판매상품'} <b className="tabular-nums">{check.products.length}</b>개
        </span>
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

      {photoBlockedIds.length > 0 && <PublicImagesPanel salesProductIds={photoBlockedIds} onUploaded={onImagesUploaded} />}

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
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  {check.scope === 'selected' ? '고른 판매상품이 판매중이 아니거나 이미 이 몰에 있습니다.' : '이 몰에 없는 판매상품이 없습니다.'}
                </td>
              </tr>
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
          같은 상품이 다른 몰에서 쓰는 분류, 없으면 이름이 비슷한 판매상품이 이 몰에서 쓰는 분류로 짐작했습니다. 짐작이라 틀릴 수 있어요 — 확인하고 고쳐서 저장하면 판매상품 몰별 값에 남습니다.
          {sheet.categoryBy === 'code' ? ' 이 몰은 분류 번호로 받아, 몰 분류표에 있는 경로여야 합니다.' : ''}
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {groups.map((group) => (
          <CategoryGroupRow
            key={`${group.mallKey}|${group.suggestion ?? ''}`}
            sheetKey={sheet.sheetKey}
            group={group}
            onAssign={onAssign}
            assigning={assigning}
          />
        ))}
      </ul>
    </div>
  );
}

const BASIS_LABEL: Record<NonNullable<MallSheetCategoryGroup['basis']>, string> = {
  other_malls: '다른 몰 분류',
  similar_names: '비슷한 이름',
  mixed: '다른 몰 분류 · 비슷한 이름',
};

function CategoryGroupRow({
  sheetKey,
  group,
  onAssign,
  assigning,
}: {
  sheetKey: string;
  group: MallSheetCategoryGroup;
  onAssign: (group: MallSheetCategoryGroup, path: string) => void;
  assigning: boolean;
}) {
  const [path, setPath] = useState(group.suggestion ?? '');
  // 몰에서 판매상품이 쓴 분류 목록 — 칸에 들어갈 때 한 번 읽어 고를거리로 보인다.
  const [wantsList, setWantsList] = useState(false);
  const known = useQuery({
    queryKey: salesProductKeys.mallCategories(group.mallKey),
    queryFn: () => salesProductApi.mallCategories(group.mallKey),
    enabled: wantsList,
    staleTime: 5 * 60_000,
  });
  // 몰이 가진 분류표에서 찾기 — 우리가 안 써 본 분류도 고를 수 있다(티쳐몰 · 꼬망세 · 떠리몰).
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!wantsList) return undefined;
    const timer = setTimeout(() => setSearch(path.trim()), 300);
    return () => clearTimeout(timer);
  }, [wantsList, path]);
  const mallList = useQuery({
    queryKey: salesProductKeys.mallSheetCategories(sheetKey, group.mallKey, search),
    queryFn: () => salesProductApi.searchMallSheetCategories(sheetKey, group.mallKey, search),
    enabled: wantsList,
    staleTime: 5 * 60_000,
  });
  const mallLabel = MALL_LABEL[group.mallKey] ?? group.mallKey;
  const listId = `mall-categories-${group.mallKey}-${group.salesProductIds[0]}`;
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 shrink-0 font-medium text-slate-700">{mallLabel}</span>
        <span className="w-20 shrink-0 tabular-nums text-slate-500">{group.salesProductIds.length}개</span>
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onFocus={() => setWantsList(true)}
          list={listId}
          placeholder="분류 경로를 적거나 목록에서 고르세요"
          aria-label={`${mallLabel} 분류 경로`}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <datalist id={listId}>
          {(mallList.data?.paths ?? []).map((mallPath) => (
            <option key={`mall:${mallPath}`} value={mallPath}>몰 분류</option>
          ))}
          {(known.data?.categories ?? []).slice(0, 300).map((category) => (
            <option key={category.path} value={category.path}>{`우리가 쓴 분류 · ${category.count}개`}</option>
          ))}
        </datalist>
        {group.suggestion && path.trim() === group.suggestion && (
          <span className={cn('shrink-0 text-xs', group.resolves ? 'text-slate-500' : 'text-amber-700')}>
            {group.resolves
              ? `짐작 ${Math.round(group.share * 100)}%${group.basis ? ` · ${BASIS_LABEL[group.basis]}` : ''}`
              : '번호 없음'}
          </span>
        )}
        <button
          type="button"
          className="btn-secondary btn-sm shrink-0"
          disabled={!path.trim() || assigning}
          onClick={() => onAssign(group, path.trim())}
        >
          이 {group.salesProductIds.length}개에 저장
        </button>
      </div>
      {!group.suggestion && (
        <p className="mt-1 pl-[9.5rem] text-xs text-slate-500">
          추천이 없습니다 — 칸에 글자를 넣으면 몰 분류표{mallList.data?.total ? `(${mallList.data.total}개)` : ''}에서 찾아 줍니다.
        </p>
      )}
      <details className="mt-1 pl-[9.5rem] text-xs text-slate-500">
        <summary className="cursor-pointer">상품 보기</summary>
        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
          {group.names.map((name) => <li key={name}>{name}</li>)}
        </ul>
      </details>
    </li>
  );
}

/**
 * 몰이 못 읽는 사진(우리 사진 저장소) — 확장이 우리 상점 첨부 저장소(키즈노트)에 올려 공개 주소를 만든다. 판매상품의
 * 사진 주소는 그대로 두고, 엑셀을 만들 때만 공개 주소로 바꿔 넣는다.
 */
function PublicImagesPanel({ salesProductIds, onUploaded }: { salesProductIds: string[]; onUploaded: () => void }) {
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: salesProductKeys.publicImages(salesProductIds),
    queryFn: () => salesProductApi.pendingPublicImages(salesProductIds),
  });
  const [progress, setProgress] = useState<PublicImageUploadProgress | null>(null);
  const stop = useRef<AbortController | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      stop.current = new AbortController();
      return uploadPublicImages(pending.data?.urls ?? [], {
        save: salesProductApi.savePublicImages,
        onProgress: setProgress,
        signal: stop.current.signal,
      });
    },
    onSuccess: (result) => {
      if (result.needsLogin) {
        toast.error('키즈노트 관리자에 로그인되어 있지 않습니다. 로그인한 뒤 다시 누르세요.', {
          description: result.saved > 0 ? `사진 ${result.saved}장은 올렸습니다.` : undefined,
        });
      } else if (result.failed.length > 0) {
        toast.warning(`사진 ${result.saved}장을 올렸고 ${result.failed.length}장은 못 올렸습니다.`, {
          description: result.failed[0]!.error,
        });
      } else {
        toast.success(`사진 ${result.saved}장을 올렸습니다. 다시 확인합니다.`);
      }
      void queryClient.invalidateQueries({ queryKey: [...salesProductKeys.all, 'public-images'] });
      if (result.saved > 0) onUploaded();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '사진을 올리지 못했습니다.'),
    onSettled: () => {
      setProgress(null);
      stop.current = null;
    },
  });

  const urls = pending.data?.urls ?? [];
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-sky-900">
          몰이 못 읽는 사진 <span className="tabular-nums">{urls.length}</span>장 · 판매상품 <span className="tabular-nums">{pending.data!.products}</span>개
        </p>
        <p className="mt-0.5 text-xs text-sky-800">
          우리 사진 저장소는 몰 서버가 열지 못합니다. [사진 올리기]를 누르면 확장이 키즈노트 첨부 저장소에 올려 공개 주소를 만듭니다 — 키즈노트 관리자에 로그인해 두세요. 상품은 만들지 않습니다.
        </p>
      </div>
      {upload.isPending ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums text-sky-900">
            올리는 중 {progress?.done ?? 0}/{progress?.total ?? urls.length}
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => stop.current?.abort()}>그만</button>
        </div>
      ) : (
        <button type="button" className="btn-primary btn-sm inline-flex shrink-0 items-center gap-1.5" onClick={() => upload.mutate()}>
          <ImageUp size={15} aria-hidden /> 사진 올리기
        </button>
      )}
    </div>
  );
}
