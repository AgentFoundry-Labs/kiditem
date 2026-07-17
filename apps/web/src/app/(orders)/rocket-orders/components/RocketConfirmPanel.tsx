'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Upload,
} from 'lucide-react';
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
  loadSavedRocketPos,
  previewSavedRocketConfirm,
  type RocketConfirmCommitResult,
  type RocketComputedRow,
  type RocketSavedPo,
} from '../lib/rocket-confirm-api';
import { saveRocketConfirmFile } from '@/lib/rocket-confirm-file-store';

type Busy = null | 'collect' | 'preview' | 'download' | 'fill';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: ymd(new Date(y, m, 0)) };
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function RocketConfirmPanel({ onSaved }: { onSaved: () => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [rows, setRows] = useState<RocketComputedRow[] | null>(null);
  const [poCount, setPoCount] = useState(0);
  const [commitResult, setCommitResult] = useState<RocketConfirmCommitResult | null>(null);
  const [commitPending, setCommitPending] = useState(false);

  // 월 달력 — 기본값: 이번 달. 저장된 발주(rocket_purchase_orders)를 입고예정일별로 표시.
  const [viewMonth, setViewMonth] = useState(currentMonthKey);
  const [savedPos, setSavedPos] = useState<RocketSavedPo[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  // 오늘 이후 입고예정일 = 아직 확정·납품해야 할 "앞으로 할 작업" → 배경 강조.
  const [todayKey] = useState(() => ymd(new Date()));

  const reloadSaved = useCallback(async (month: string) => {
    setSavedLoading(true);
    try {
      const { from, to } = monthRange(month);
      setSavedPos(await loadSavedRocketPos(from, to));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장된 발주를 불러오지 못했습니다.');
      setSavedPos([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSaved(viewMonth);
  }, [viewMonth, reloadSaved]);

  // 입고예정일별 집계(달력 배지용)
  const byDate = useMemo(() => {
    const map = new Map<string, { count: number; qty: number }>();
    for (const po of savedPos) {
      const cur = map.get(po.businessDate) ?? { count: 0, qty: 0 };
      cur.count += 1;
      cur.qty += po.orderQty;
      map.set(po.businessDate, cur);
    }
    return map;
  }, [savedPos]);

  const cells = useMemo(() => {
    const [year, month] = viewMonth.split('-').map(Number);
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const days = new Date(year, month, 0).getDate();
    const list: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) list.push(null);
    for (let d = 1; d <= days; d += 1) list.push({ day: d, date: `${viewMonth}-${pad(d)}` });
    return list;
  }, [viewMonth]);

  const monthTotal = useMemo(
    () => savedPos.reduce((acc, po) => ({ po: acc.po + 1, qty: acc.qty + po.orderQty }), { po: 0, qty: 0 }),
    [savedPos],
  );

  // 저장된 하루치를 재고 매칭해 미리보기(재수집 없음)
  async function selectDay(date: string) {
    setSelectedDate(date);
    setBusy('preview');
    setRows(null);
    setCommitResult(null);
    try {
      const preview = await previewSavedRocketConfirm(date);
      setRows(preview.rows);
      setPoCount(new Set(preview.rows.map((r) => r.poNumber)).size);
      if (preview.rows.length === 0) toast.info(`${date} 저장된 발주가 없습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '미리보기 실패');
    } finally {
      setBusy(null);
    }
  }

  // 쿠팡에서 이 달치를 한 번 수집해 DB 에 저장(이후엔 달력에서 클릭만 하면 됨)
  async function collectMonth() {
    setBusy('collect');
    try {
      const { from, to } = monthRange(viewMonth);
      const { rows: scraped, poCount: count } = await collectRocketPoRowsFromExtension(from, to);
      if (!scraped.length) {
        toast.error('해당 월 거래처확인요청 발주가 없습니다.');
        return;
      }
      await previewRocketConfirm(scraped); // 계산 겸 rocket_purchase_orders 에 저장
      await reloadSaved(viewMonth);
      toast.success(`${viewMonth} 수집·저장 완료 — 발주 ${formatNumber(count)}건. 날짜를 클릭하면 미리보기가 나옵니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수집 실패');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '다운로드 실패');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '예약 확정 실패');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '양식 채우기 실패');
    } finally {
      setBusy(null);
    }
  }

  const confirmTotals = rows
    ? rows.reduce(
        (acc, r) => {
          const amt = (Number(r.purchasePrice) || 0) * r.confirmQty;
          return { qty: acc.qty + r.confirmQty, amt: acc.amt + amt, short: acc.short + (r.confirmQty < r.orderQty ? 1 : 0) };
        },
        { qty: 0, amt: 0, short: 0 },
      )
    : null;

  const monthLabel = `${viewMonth.split('-')[0]}년 ${Number(viewMonth.split('-')[1])}월`;

  return (
    <div className="space-y-3">
      {/* 월 달력 — 저장된 발주(입고예정일별). 날짜 클릭 → 저장분으로 미리보기. */}
      <div className="overflow-hidden rounded-xl border border-purple-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-purple-600" />
            <span className="text-sm font-semibold text-slate-900">발주확정 · 입고예정일 달력</span>
            <span className="text-xs text-slate-400">
              저장 발주 {formatNumber(monthTotal.po)}건 · {formatNumber(monthTotal.qty)}수량
            </span>
          </div>
          <button
            type="button"
            onClick={() => void collectMonth()}
            disabled={busy !== null}
            title="이 달 거래처확인요청 발주를 쿠팡에서 한 번 수집해 저장합니다. 이후엔 날짜 클릭만 하면 됩니다."
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
              busy !== null && 'pointer-events-none opacity-60',
            )}
          >
            {busy === 'collect' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {busy === 'collect' ? '수집 중…' : '이 달 쿠팡에서 수집'}
          </button>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => shiftMonth(m, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold tabular-nums text-slate-900">
              {monthLabel}
              {savedLoading ? <Loader2 size={13} className="animate-spin text-purple-500" /> : null}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((m) => shiftMonth(m, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={cn(
                  'py-1 text-center text-xs font-medium',
                  i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400',
                )}
              >
                {w}
              </div>
            ))}
            {cells.map((cell, index) => {
              if (!cell) return <div key={`blank-${index}`} />;
              const info = byDate.get(cell.date);
              const has = Boolean(info);
              const selected = cell.date === selectedDate;
              // 오늘 이후 입고예정일 + 발주 있음 = 앞으로 확정·납품해야 할 작업 → 강조.
              const upcoming = has && cell.date >= todayKey;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => has && void selectDay(cell.date)}
                  disabled={!has || busy !== null}
                  className={cn(
                    'flex min-h-[3.75rem] flex-col items-center justify-start gap-1 rounded-lg border px-1 py-1.5 text-center transition-colors',
                    selected
                      ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-300'
                      : upcoming
                        ? 'border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100/70'
                        : has
                          ? 'border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/50'
                          : 'border-transparent bg-transparent',
                    busy !== null && has && 'pointer-events-none opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      selected
                        ? 'font-bold text-purple-700'
                        : upcoming
                          ? 'font-bold text-amber-700'
                          : has
                            ? 'font-semibold text-slate-700'
                            : 'text-slate-300',
                    )}
                  >
                    {cell.day}
                  </span>
                  {info ? (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                        selected
                          ? 'bg-purple-600 text-white'
                          : upcoming
                            ? 'bg-amber-500 text-white'
                            : 'bg-purple-100 text-purple-700',
                      )}
                    >
                      {formatNumber(info.count)}건
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-50" />
                오늘 이후(확정·납품 예정)
              </span>
              <span className="text-slate-300">·</span>
              날짜 클릭 → 저장된 발주를 재고와 매칭해 미리보기(재수집 없음)
            </span>
            <label
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-50',
                busy !== null && 'pointer-events-none opacity-60',
              )}
            >
              {busy === 'fill' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              쿠팡 양식 채우기
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
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="text-sm font-semibold text-slate-900">
              미리보기 · 편집{' '}
              <span className="text-xs font-normal text-slate-400">
                {selectedDate} · 발주 {poCount}건 · {rows.length}행
              </span>
            </div>
            <div className="flex items-center gap-4">
              {confirmTotals && (
                <span className="text-xs text-slate-500">
                  확정 <b className="tabular-nums text-slate-900">{formatNumber(confirmTotals.qty)}</b>개 · 부족{' '}
                  <b className="tabular-nums text-amber-600">{confirmTotals.short}</b>행 · 금액{' '}
                  <b className="tabular-nums text-purple-700">{formatKRW(confirmTotals.amt)}</b>원
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
                  <th className="px-3 py-2 text-left font-semibold">상품 (바코드)</th>
                  <th className="px-3 py-2 text-right font-semibold">발주</th>
                  <th className="px-3 py-2 text-right font-semibold">재고</th>
                  <th className="px-3 py-2 text-right font-semibold">확정수량</th>
                  <th className="px-3 py-2 text-left font-semibold">납품부족사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const short = r.confirmQty < r.orderQty;
                  return (
                    <tr key={`${r.poNumber}-${r.barcode}-${i}`} className={cn('border-t border-slate-100', short && 'bg-amber-50/40')}>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">{r.poNumber}</td>
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
                          <span className="text-[11px] text-red-400">미매칭</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {r.matchKind === 'name' && (
                              <span className="rounded bg-sky-50 px-1 py-0.5 text-[9px] font-medium text-sky-600" title="바코드가 아닌 상품명으로 매칭됨 — 확인 권장">이름</span>
                            )}
                            {r.matchKind === 'name-fuzzy' && (
                              <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-600" title="상품명 유사매칭 — 오매칭 가능, 꼭 확인하세요">유사</span>
                            )}
                            <span className="text-slate-500">{formatNumber(r.available)}</span>
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

      {rows && rows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
          {selectedDate} 저장된 발주가 없습니다. 위에서 “이 달 쿠팡에서 수집”을 눌러 저장해주세요.
        </div>
      )}
    </div>
  );
}
