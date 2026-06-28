'use client';

import { useState } from 'react';
import { Download, Loader2, Package, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import {
  ROCKET_SHORTAGE_REASONS,
  collectRocketPoRowsFromExtension,
  generateRocketConfirmFile,
  previewRocketConfirm,
  type RocketComputedRow,
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

export function RocketConfirmPanel({ onSaved }: { onSaved: () => void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [rows, setRows] = useState<RocketComputedRow[] | null>(null);
  const [poCount, setPoCount] = useState(0);
  // 입고예정일(다음 7일) 범위 — 거래처확인요청 발주를 이 eta 안의 것만 가져온다.
  const [etaFrom, setEtaFrom] = useState(todayYmd());
  const [etaTo, setEtaTo] = useState(plusDaysYmd(7));

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
          return { qty: acc.qty + r.confirmQty, amt: acc.amt + amt, short: acc.short + (r.confirmQty < r.orderQty ? 1 : 0) };
        },
        { qty: 0, amt: 0, short: 0 },
      )
    : null;

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
                  setEtaTo(plusDaysYmd(7));
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
            </div>
          </div>
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
                          <span className="text-slate-500">{formatNumber(r.available)}</span>
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
