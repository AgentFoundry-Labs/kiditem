'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boxes, Check, Link2, Loader2, RefreshCw, Search, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNumber } from '@/lib/utils';
import {
  connectCoupangListing,
  listCoupangCatalog,
  patchCoupangListing,
  rematchCoupangCatalog,
  searchSingleOptions,
  suggestSearchTerm,
  syncCoupangCatalog,
  type CoupangListing,
  type KidItemOption,
} from '../lib/bundle-register-api';

function optionLabel(o: KidItemOption): string {
  const name = o.masterName ? `${o.masterName} ${o.optionName ?? ''}`.trim() : o.optionName ?? '(옵션)';
  const code = o.barcode || o.legacyCode || o.sku || '';
  return code ? `${name} · ${code}` : name;
}

/** 연결대기 정렬: 확실매칭(suggested) → 유사매칭(fuzzy·확인) → 매칭없음(unmatched). */
const PENDING_ORDER: Record<string, number> = { suggested: 0, fuzzy: 1, unmatched: 2 };

type FixState = { open: boolean; search: string; results: KidItemOption[] | null; busy: boolean };

export function BundleRegisterPanel() {
  const [rows, setRows] = useState<CoupangListing[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [fix, setFix] = useState<Record<string, FixState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  async function loadList() {
    setLoading(true);
    try {
      const list = await listCoupangCatalog({ onlyBundles: true });
      setRows(list);
      // 연결 안 됐고 매칭 제안 있는 것 기본 선택
      setChecked(new Set(list.filter((r) => r.matchStatus === 'suggested' && r.matchedOptionId).map((r) => r.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '목록 조회 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncCoupangCatalog();
      toast.success(
        `동기화 — 상품 ${formatNumber(res.total)} · 묶음후보 ${formatNumber(res.bundleCandidates)} · 매칭 ${formatNumber(res.matched)}` +
          (res.added ? ` · 발주보충 ${formatNumber(res.added)}` : ''),
      );
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '쿠팡 상품 동기화 실패');
    } finally {
      setSyncing(false);
    }
  }

  async function handleRematch() {
    setRematching(true);
    try {
      const res = await rematchCoupangCatalog();
      toast.success(
        `재매칭 — ${formatNumber(res.matched)} / ${formatNumber(res.total)} 매칭됨` +
          (res.added ? ` · 발주에서 ${formatNumber(res.added)}개 보충` : ''),
      );
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '재매칭 실패');
    } finally {
      setRematching(false);
    }
  }

  const candidates = rows ?? [];
  const connected = candidates.filter((r) => r.matchStatus === 'bundled' || r.matchStatus === 'linked');
  const fuzzyCount = candidates.filter((r) => r.matchStatus === 'fuzzy').length;
  const pending = candidates
    .filter((r) => r.matchStatus === 'suggested' || r.matchStatus === 'fuzzy' || r.matchStatus === 'unmatched')
    .sort((a, b) => (PENDING_ORDER[a.matchStatus] ?? 9) - (PENDING_ORDER[b.matchStatus] ?? 9));
  const checkedConnectable = useMemo(
    () => pending.filter((r) => checked.has(r.id) && r.matchedOptionId && r.packQty),
    [pending, checked],
  );

  function patchRow(id: string, p: Partial<CoupangListing>) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...p } : r)) : prev));
  }

  async function connectOne(row: CoupangListing): Promise<boolean> {
    if (!row.matchedOptionId || !row.packQty || !row.barcode) return false;
    setBusy((prev) => new Set(prev).add(row.id));
    try {
      const res = await connectCoupangListing({
        barcode: row.barcode,
        name: row.productName,
        componentOptionId: row.matchedOptionId,
        qty: row.packQty,
      });
      if (res.mode === 'linked') {
        // 쿠팡 바코드가 이미 낱개 바코드와 동일 → 로켓이 직접 찾음(이미 연결).
        await patchCoupangListing(row.id, { matchStatus: 'linked', matchedOptionId: res.optionId });
        patchRow(row.id, { matchStatus: 'linked', matchedOptionId: res.optionId });
      } else {
        await patchCoupangListing(row.id, { matchStatus: 'bundled', bundleOptionId: res.bundleOptionId });
        patchRow(row.id, { matchStatus: 'bundled', bundleOptionId: res.bundleOptionId });
      }
      setChecked((prev) => {
        const n = new Set(prev);
        n.delete(row.id);
        return n;
      });
      return true;
    } catch (e) {
      toast.error(`${row.productName.slice(0, 16)} — ${e instanceof Error ? e.message : '연결 실패'}`);
      return false;
    } finally {
      setBusy((prev) => {
        const n = new Set(prev);
        n.delete(row.id);
        return n;
      });
    }
  }

  async function handleBulkConnect() {
    const targets = checkedConnectable;
    if (!targets.length) return;
    if (!window.confirm(`선택한 ${targets.length}개 묶음을 번들로 연결할까요? (쿠팡 묶음 = 셀피아 단품 × N)`)) return;
    setBulkRunning(true);
    let ok = 0;
    for (const row of targets) {
      if (await connectOne(row)) ok += 1;
    }
    setBulkRunning(false);
    toast.success(`연결 완료 ${ok} / ${targets.length}`);
  }

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function runFixSearch(row: CoupangListing) {
    const f = fix[row.id] ?? { open: true, search: suggestSearchTerm(row.productName), results: null, busy: false };
    setFix((prev) => ({ ...prev, [row.id]: { ...f, busy: true } }));
    try {
      const results = await searchSingleOptions(f.search);
      setFix((prev) => ({ ...prev, [row.id]: { ...f, results, busy: false } }));
    } catch {
      setFix((prev) => ({ ...prev, [row.id]: { ...f, busy: false, results: [] } }));
    }
  }

  async function pickMatch(row: CoupangListing, o: KidItemOption) {
    try {
      await patchCoupangListing(row.id, { matchedOptionId: o.id, matchStatus: 'suggested' });
      patchRow(row.id, {
        matchedOptionId: o.id,
        matchStatus: 'suggested',
        matchedOption: { id: o.id, name: optionLabel(o), barcode: o.barcode, availableStock: 0 },
      });
      setChecked((prev) => new Set(prev).add(row.id));
      setFix((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] as FixState), open: false } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '매칭 변경 실패');
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/30">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Boxes size={16} className="text-indigo-500" /> 쿠팡 현재 등록 상품 · 묶음(번들) 연결
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            쿠팡 등록 상품을 저장하고 <b>이름(숫자 빼고)</b>으로 셀피아 낱개와 자동 매칭 →{' '}
            <b>묶음 = 단품 × N</b>으로 연결. 매칭은 <b>네가 확인·수정</b> 후 연결돼요.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRematch()}
            disabled={rematching || syncing || rows === null}
            title="쿠팡 재수집 없이 저장된 카탈로그를 다시 매칭 (봇탐지 위험 없음)"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50',
              (rematching || syncing || rows === null) && 'pointer-events-none opacity-50',
            )}
          >
            {rematching ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {rematching ? '재매칭 중…' : '재매칭'}
          </button>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700',
              syncing && 'pointer-events-none opacity-60',
            )}
          >
            {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {syncing ? '동기화 중…' : '쿠팡 상품 동기화'}
          </button>
        </div>
      </div>

      {(rows !== null || loading) && (
        <div className="border-t border-indigo-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs text-slate-500">
            <span>
              묶음 후보 <b className="tabular-nums text-slate-800">{formatNumber(candidates.length)}</b> · 연결됨{' '}
              <b className="tabular-nums text-emerald-600">{formatNumber(connected.length)}</b>
              {fuzzyCount > 0 && (
                <>
                  {' '}· 유사(확인){' '}
                  <b className="tabular-nums text-amber-600">{formatNumber(fuzzyCount)}</b>
                </>
              )}{' '}
              · 선택 <b className="tabular-nums text-indigo-600">{formatNumber(checkedConnectable.length)}</b>
            </span>
            <button
              type="button"
              onClick={() => void handleBulkConnect()}
              disabled={bulkRunning || checkedConnectable.length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {bulkRunning ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              선택 연결 {formatNumber(checkedConnectable.length)}
            </button>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">불러오는 중…</div>
          ) : candidates.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              저장된 묶음 후보가 없습니다. <b>쿠팡 상품 동기화</b>를 먼저 눌러주세요.
            </div>
          ) : (
            <div className="max-h-[600px] divide-y divide-slate-100 overflow-auto">
              {[...pending, ...connected].map((r) => {
                const isConnected = r.matchStatus === 'bundled' || r.matchStatus === 'linked';
                const rowBusy = busy.has(r.id);
                const f = fix[r.id];
                return (
                  <div key={r.id} className={cn('px-5 py-2.5', isConnected && 'bg-emerald-50/40')}>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isConnected && (
                        <input
                          type="checkbox"
                          checked={checked.has(r.id)}
                          disabled={!r.matchedOptionId || rowBusy}
                          onChange={(e) => toggle(r.id, e.target.checked)}
                          className="h-4 w-4 flex-none rounded border-slate-300"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-slate-800">
                          {r.productName}
                          {r.packQty ? <span className="ml-1 text-[11px] text-indigo-500">묶음 {r.packQty}개</span> : null}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">{r.barcode || '바코드 없음'}</div>
                      </div>
                      <div className="min-w-0 flex-1 text-right text-xs">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <Check size={12} />
                            {r.matchStatus === 'linked'
                              ? '바코드 직접매칭 (번들 불필요)'
                              : `번들 연결됨${r.packQty ? ` × ${r.packQty}` : ''}`}
                          </span>
                        ) : r.matchedOption ? (
                          <span className="text-slate-600">
                            {r.matchStatus === 'fuzzy' && (
                              <span
                                className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-700"
                                title="이름 유사매칭 — 오매칭일 수 있으니 확인 후 연결하세요"
                              >
                                유사·확인
                              </span>
                            )}
                            → <b className="text-indigo-700">{r.matchedOption.name}</b>
                            <span className="ml-1 text-slate-400">재고 {formatNumber(r.matchedOption.availableStock)}</span>
                          </span>
                        ) : (
                          <span className="text-amber-600">매칭 없음</span>
                        )}
                      </div>
                      {!isConnected && (
                        <div className="flex flex-none items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setFix((prev) => ({ ...prev, [r.id]: { open: !(f?.open), search: f?.search ?? suggestSearchTerm(r.productName), results: f?.results ?? null, busy: false } }))}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                          >
                            변경
                          </button>
                          <button
                            type="button"
                            onClick={() => void connectOne(r)}
                            disabled={!r.matchedOptionId || rowBusy}
                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {rowBusy ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                            연결
                          </button>
                        </div>
                      )}
                    </div>

                    {!isConnected && f?.open && (
                      <div className="mt-2 space-y-1.5 pl-6">
                        <div className="flex items-center gap-1.5">
                          <input
                            value={f.search}
                            onChange={(e) => setFix((prev) => ({ ...prev, [r.id]: { ...f, search: e.target.value } }))}
                            onKeyDown={(e) => e.key === 'Enter' && void runFixSearch(r)}
                            placeholder="셀피아 낱개 상품명/코드"
                            className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void runFixSearch(r)}
                            disabled={f.busy}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {f.busy ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} 찾기
                          </button>
                        </div>
                        {f.results && (
                          <div className="flex flex-wrap gap-1">
                            {f.results.length === 0 ? (
                              <span className="text-[11px] text-amber-600">일치하는 단품이 없어요.</span>
                            ) : (
                              f.results.slice(0, 8).map((o) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => void pickMatch(r, o)}
                                  className="max-w-[260px] truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-indigo-50"
                                  title={optionLabel(o)}
                                >
                                  {optionLabel(o)}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
