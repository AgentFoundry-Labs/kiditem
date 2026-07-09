'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2, Package, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  ROCKET_SHORTAGE_REASONS,
  commitRocketConfirmRows,
  collectRocketPoRowsFromExtension,
  generateRocketConfirmFile,
  previewRocketConfirm,
  type RocketConfirmCommitResult,
  type RocketComputedRow,
  type RocketMatchReason,
} from '../lib/rocket-confirm-api';
import { saveRocketConfirmFile } from '../lib/rocket-confirm-file-store';

type Busy = null | 'preview' | 'download' | 'fill';

function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayYmd() {
  return ymd(new Date());
}
function plusDaysYmd(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 미매칭 재고 칸에 붙일 짧은 꼬리표 (왜 미매칭인지). */
function unmatchedTag(reason?: RocketMatchReason): string {
  if (reason === 'no_barcode') return '바코드없음';
  if (reason === 'no_product') return '상품없음';
  return '';
}
/** 미매칭 재고 칸 hover 시 안내 문구. */
function unmatchedHint(reason?: RocketMatchReason): string {
  if (reason === 'no_barcode') return '쿠팡 발주에 상품바코드가 없어 재고를 매칭할 수 없어요.';
  if (reason === 'no_product')
    return '이 바코드로 등록된 KidItem 상품이 없어요. 상품에 바코드를 연결하면 셀피아 재고가 잡힙니다.';
  return '재고를 매칭하지 못했어요.';
}

/** 발주일시("YYYY-MM-DD HH:mm:ss")에서 날짜만. 없으면 '미정'. */
function orderDateOf(r: RocketComputedRow): string {
  const s = String(r.poRegisteredAt ?? '').slice(0, 10);
  return s || '미정';
}
/** 입고예정일("YYYYMMDD" 컴팩트)을 "YYYY-MM-DD"로. */
function fmtEta(r: RocketComputedRow): string {
  const s = String(r.expectedInboundDate ?? '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || '—';
}

type PreviewItem =
  | { type: 'header'; date: string; count: number; qty: number; amt: number; short: number }
  | { type: 'row'; row: RocketComputedRow; index: number };

/**
 * 미리보기 행을 발주일(발주일시 날짜)별로 그룹핑한 표시용 리스트.
 * ⭐setRows 원본은 재정렬하지 않는다(다운로드/커밋 순서·인덱스 유지). 표시용으로만 정렬하고,
 * 편집(editRow)은 반드시 원본 index 를 넘긴다.
 */
function groupByOrderDate(rows: RocketComputedRow[]): PreviewItem[] {
  const withIdx = rows.map((row, index) => ({ row, index }));
  withIdx.sort((a, b) => {
    const ka = orderDateOf(a.row) === '미정' ? '9999-99-99' : orderDateOf(a.row);
    const kb = orderDateOf(b.row) === '미정' ? '9999-99-99' : orderDateOf(b.row);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.index - b.index; // 안정: 같은 발주일 내 원래 순서 유지
  });
  const stats = new Map<string, { count: number; qty: number; amt: number; short: number }>();
  for (const { row } of withIdx) {
    const d = orderDateOf(row);
    const s = stats.get(d) ?? { count: 0, qty: 0, amt: 0, short: 0 };
    s.count += 1;
    s.qty += row.confirmQty;
    s.amt += (Number(row.purchasePrice) || 0) * row.confirmQty;
    s.short += row.confirmQty < row.orderQty ? 1 : 0;
    stats.set(d, s);
  }
  const items: PreviewItem[] = [];
  let cur: string | null = null;
  for (const { row, index } of withIdx) {
    const d = orderDateOf(row);
    if (d !== cur) {
      cur = d;
      items.push({ type: 'header', date: d, ...stats.get(d)! });
    }
    items.push({ type: 'row', row, index });
  }
  return items;
}

export function RocketConfirmPanel({ onSaved }: { onSaved: () => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [rows, setRows] = useState<RocketComputedRow[] | null>(null);
  const [poCount, setPoCount] = useState(0);
  const [commitResult, setCommitResult] = useState<RocketConfirmCommitResult | null>(null);
  const [commitPending, setCommitPending] = useState(false);
  // 입고예정일(다음 7일) 범위 — 거래처확인요청 발주를 이 eta 안의 것만 가져온다.
  const [etaFrom, setEtaFrom] = useState(todayYmd());
  const [etaTo, setEtaTo] = useState(plusDaysYmd(6));

  async function handlePreview() {
    setBusy('preview');
    setRows(null);
    try {
      const { rows: scraped, poCount: count } = await collectRocketPoRowsFromExtension(etaFrom, etaTo);
      if (!scraped.length) {
        toast.error('해당 기간 거래처확인요청 발주가 없습니다.');
        return;
      }
      const preview = await previewRocketConfirm(scraped);
      setRows(preview.rows);
      setPoCount(count);
      setCommitResult(null);
      toast.success(`발주 ${count}건 · ${preview.rows.length}행 — 확정수량 확인/수정 후 다운로드하세요`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발주 수집 실패');
    } finally {
      setBusy(null);
    }
  }

  function editRow(index: number, patch: Partial<RocketComputedRow>) {
    setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, ...patch } : r)) : prev));
  }

  async function handleDownload() {
    if (!rows?.length) return;
    setBusy('download');
    try {
      const { blob, fileName, summary } = await generateRocketConfirmFile(rows);
      downloadBlob(blob, fileName);
      await saveRocketConfirmFile({
        id: `${Date.now()}-${fileName}`,
        fileName,
        createdAt: Date.now(),
        blob,
        totalRows: summary.total,
        fullyConfirmed: summary.confirmed,
        shortRows: summary.short,
      });
      onSaved();
      toast.success(`엑셀 다운로드 + 저장 완료 — 전량확정 ${summary.confirmed} · 부족 ${summary.short}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '다운로드 실패');
    } finally {
      setBusy(null);
    }
  }

  async function handleCommitReservation() {
    if (!rows?.length || commitPending || commitResult) return;
    setCommitPending(true);
    try {
      const result = await commitRocketConfirmRows(rows);
      setCommitResult(result);
      const message = `예약 확정 — 신규 ${result.reservedRows} · 중복 ${result.alreadyReservedRows} · 제외 ${result.skippedRows} · 실패 ${result.failedRows}`;
      if (result.failedRows > 0) toast.warning(message);
      else toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '예약 확정 실패');
    } finally {
      setCommitPending(false);
    }
  }

  async function handleFill(file: File) {
    setBusy('fill');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.fetchRaw('/api/orders/rocket/confirm-fill', { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.text().catch(() => '')) || '양식 채우기 실패');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const fileName = m ? decodeURIComponent(m[1]) : `발주확정_${Date.now()}.xlsx`;
      downloadBlob(blob, fileName);
      await saveRocketConfirmFile({
        id: `${Date.now()}-${fileName}`,
        fileName,
        createdAt: Date.now(),
        blob,
        totalRows: Number(res.headers.get('X-Rocket-Total') ?? 0),
        fullyConfirmed: Number(res.headers.get('X-Rocket-Confirmed') ?? 0),
        shortRows: Number(res.headers.get('X-Rocket-Short') ?? 0),
      });
      onSaved();
      toast.success('쿠팡 양식 채우기 완료 — 다운로드 + 저장');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '양식 채우기 실패');
    } finally {
      setBusy(null);
    }
  }

  const confirmTotals = rows
    ? rows.reduce(
        (acc, r) => {
          const amt = (Number(r.purchasePrice) || 0) * r.confirmQty;
          return {
            qty: acc.qty + r.confirmQty,
            amt: acc.amt + amt,
            short: acc.short + (r.confirmQty < r.orderQty ? 1 : 0),
            unmatched: acc.unmatched + (r.available === null ? 1 : 0),
          };
        },
        { qty: 0, amt: 0, short: 0, unmatched: 0 },
      )
    : null;

  // 발주일별 그룹 + 소계 (표시 전용 — 원본 rows 순서는 유지, 편집은 원본 index 로)
  const previewItems = useMemo(() => (rows ? groupByOrderDate(rows) : []), [rows]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-purple-200 bg-purple-50/40 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">발주확정 양식 생성</div>
            <div className="mt-0.5 text-xs text-slate-500">
              <b>거래처확인요청</b> + <b>입고예정일</b> 범위(기본 다음 7일) 발주만 수집 → 재고로 확정수량 계산 → <b>아래에서 미리보기·수정</b> → 엑셀 다운로드.
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400">입고예정일</span>
              <input
                type="date"
                value={etaFrom}
                onChange={(e) => setEtaFrom(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1"
              />
              <span className="text-slate-300">~</span>
              <input
                type="date"
                value={etaTo}
                onChange={(e) => setEtaTo(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1"
              />
              <button
                type="button"
                onClick={() => {
                  setEtaFrom(todayYmd());
                  setEtaTo(plusDaysYmd(6));
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-purple-600 hover:bg-purple-50"
              >
                다음 7일
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={busy !== null}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700',
                busy !== null && 'pointer-events-none opacity-60',
              )}
            >
              {busy === 'preview' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {busy === 'preview' ? '수집 중…' : '발주리스트에서 양식 만들기'}
            </button>
            <label
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50',
                busy !== null && 'pointer-events-none opacity-60',
              )}
            >
              {busy === 'fill' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {busy === 'fill' ? '채우는 중…' : '쿠팡 양식 채우기'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFill(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 편집 미리보기 */}
      {rows && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="text-sm font-semibold text-slate-900">
              미리보기 · 편집 <span className="text-xs font-normal text-slate-400">발주 {poCount}건 · {rows.length}행</span>
            </div>
            <div className="flex items-center gap-4">
              {confirmTotals && (
                <span className="text-xs text-slate-500">
                  확정 <b className="tabular-nums text-slate-900">{formatNumber(confirmTotals.qty)}</b>개 · 부족{' '}
                  <b className="tabular-nums text-amber-600">{confirmTotals.short}</b>행 · 금액{' '}
                  <b className="tabular-nums text-purple-700">{formatKRW(confirmTotals.amt)}</b>원
                  {confirmTotals.unmatched > 0 && (
                    <>
                      {' '}· 미매칭 <b className="tabular-nums text-red-500">{confirmTotals.unmatched}</b>행
                    </>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={busy !== null}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700',
                  busy !== null && 'pointer-events-none opacity-60',
                )}
              >
                {busy === 'download' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                엑셀 다운로드
              </button>
              <button
                type="button"
                onClick={() => void handleCommitReservation()}
                disabled={busy !== null || commitPending || Boolean(commitResult)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800',
                  (busy !== null || commitPending || Boolean(commitResult)) && 'pointer-events-none opacity-60',
                )}
              >
                {commitPending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                예약 확정
              </button>
            </div>
          </div>
          {confirmTotals && confirmTotals.unmatched > 0 && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
              미매칭 <b className="tabular-nums">{confirmTotals.unmatched}</b>행 — 재고를 확인하지 못해{' '}
              <b>확정수량 0(품절)</b>으로 내려갑니다. 셀피아에 재고가 있어도 상품에{' '}
              <b>바코드가 연결</b>돼 있지 않으면 잡히지 않아요. 상품 바코드 연결을 확인하세요.
            </div>
          )}
          {commitResult && (
            <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
              예약 신규 <b className="tabular-nums">{commitResult.reservedRows}</b> · 중복{' '}
              <b className="tabular-nums">{commitResult.alreadyReservedRows}</b> · 제외{' '}
              <b className="tabular-nums">{commitResult.skippedRows}</b> · 실패{' '}
              <b className="tabular-nums">{commitResult.failedRows}</b>
              {commitResult.failed?.length ? (
                <span className="ml-2 text-amber-700">
                  {commitResult.failed[0]?.poNumber} {commitResult.failed[0]?.reason}
                </span>
              ) : null}
            </div>
          )}
          <div className="max-h-[460px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">발주번호</th>
                  <th className="px-3 py-2 text-left font-semibold">입고예정일</th>
                  <th className="px-3 py-2 text-left font-semibold">상품 (바코드)</th>
                  <th className="px-3 py-2 text-right font-semibold">발주</th>
                  <th className="px-3 py-2 text-right font-semibold">재고</th>
                  <th className="px-3 py-2 text-right font-semibold">확정수량</th>
                  <th className="px-3 py-2 text-left font-semibold">납품부족사유</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.map((item) => {
                  if (item.type === 'header') {
                    return (
                      <tr key={`h-${item.date}`} className="border-t border-slate-200 bg-slate-100/70">
                        <td colSpan={7} className="px-3 py-1.5 text-xs font-semibold text-slate-700">
                          발주일 {item.date}
                          <span className="ml-1 font-normal text-slate-400">
                            · {formatNumber(item.count)}행 · 확정 {formatNumber(item.qty)}개 · 부족{' '}
                            <b className="text-amber-600">{item.short}</b>행 · 금액{' '}
                            <b className="text-purple-700">{formatKRW(item.amt)}</b>원
                          </span>
                        </td>
                      </tr>
                    );
                  }
                  const r = item.row;
                  const i = item.index;
                  const short = r.confirmQty < r.orderQty;
                  return (
                    <tr key={`${r.poNumber}-${r.barcode}-${i}`} className={cn('border-t border-slate-100', short && 'bg-amber-50/40')}>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{r.poNumber}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-[11px] text-slate-500">{fmtEta(r)}</td>
                      <td className="max-w-[260px] px-3 py-1.5">
                        <div className="truncate text-slate-700">
                          <Package size={11} className="mr-1 inline text-purple-400" />
                          {r.productName}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">{r.barcode || '—'}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatNumber(r.orderQty)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.available === null ? (
                          <span
                            className="inline-flex flex-col items-end leading-tight"
                            title={unmatchedHint(r.matchReason)}
                          >
                            <span className="text-[11px] font-medium text-red-500">미매칭</span>
                            {unmatchedTag(r.matchReason) && (
                              <span className="text-[9px] text-red-400">{unmatchedTag(r.matchReason)}</span>
                            )}
                          </span>
                        ) : (
                          <span className={cn(r.available === 0 ? 'font-medium text-amber-600' : 'text-slate-500')}>
                            {formatNumber(r.available)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          min={0}
                          max={r.orderQty}
                          value={r.confirmQty}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(r.orderQty, Number(e.target.value) || 0));
                            editRow(i, {
                              confirmQty: v,
                              shortageReason: v < r.orderQty ? (r.shortageReason || ROCKET_SHORTAGE_REASONS[0]) : '',
                            });
                          }}
                          className={cn(
                            'w-20 rounded-md border px-2 py-1 text-right text-sm tabular-nums',
                            short ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200',
                          )}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={r.shortageReason}
                          disabled={!short}
                          onChange={(e) => editRow(i, { shortageReason: e.target.value })}
                          className={cn(
                            'w-full max-w-[280px] rounded-md border border-slate-200 px-2 py-1 text-xs',
                            !short && 'bg-slate-50 text-slate-300',
                          )}
                        >
                          <option value="">{short ? '사유 선택' : '—'}</option>
                          {ROCKET_SHORTAGE_REASONS.map((reason) => (
                            <option key={reason} value={reason}>{reason}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
