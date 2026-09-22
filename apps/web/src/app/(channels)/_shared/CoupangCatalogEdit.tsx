'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { CoupangCatalogPlanResult } from '@kiditem/shared/sales-product';
import { salesProductApi } from '@/lib/sales-product-api';
import { formatNumber } from '@/lib/utils';

/** 윙 상품 조회/수정. 여기 [엑셀 대량 수정] › Step 1·2 가 이 파일의 내려받기와 올리기다. */
const WING_DOWNLOAD_URL = 'https://wing.coupang.com/vendor-inventory/list';

/**
 * 쿠팡상품정보 수정요청 — 윙이 내려준 엑셀을 올리면 우리가 아는 값(제조사 · 모델번호 · 바코드 ·
 * 검색어)으로 **빈 칸만** 채워 돌려준다. 신규 등록 엑셀과는 다른 물건이고 둘 다 쓴다
 * (사장님 2026-09-22).
 *
 * 우리는 몰에 올리지 않는다. 사람이 윙 업로드 화면에 올리고, 윙의 업로드 목록이 결과다. 쿠팡은
 * 여러 판매자의 제안 중 골라 쓰므로 파일을 만든 것은 몰에 값이 들어갔다는 뜻이 아니다.
 */
export function CoupangCatalogEdit() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<CoupangCatalogPlanResult | null>(null);

  const check = useMutation({
    mutationFn: (picked: File) => salesProductApi.checkCoupangCatalog(picked),
    onSuccess: (result) => setPlan(result),
    onError: (error: Error) => {
      setPlan(null);
      toast.error(error.message || '엑셀을 읽지 못했습니다.');
    },
  });

  const download = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('올린 파일이 없습니다.');
      const made = await salesProductApi.downloadCoupangCatalog(file);
      const url = URL.createObjectURL(made.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = made.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return made.fileName;
    },
    onSuccess: () => toast.success('파일을 내려받았습니다. 윙 업로드 화면에 올려 주세요.'),
    onError: (error: Error) => toast.error(error.message || '수정요청 파일을 만들지 못했습니다.'),
  });

  function pick(picked: File | undefined) {
    if (!picked) return;
    setFile(picked);
    setPlan(null);
    check.mutate(picked);
  }

  const busy = check.isPending || download.isPending;

  return (
    <section
      aria-label="쿠팡상품정보 수정요청"
      className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">쿠팡상품정보 수정요청</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            윙 상품조회/수정에서 내려받은 엑셀을 올리면 제조사 · 모델번호 · 바코드 · 검색어의{' '}
            <strong className="font-semibold text-slate-700">빈 칸만</strong> 우리 값으로 채워 돌려줍니다. 올리는 것은
            사람이 합니다 — 쿠팡은 여러 판매자가 제안한 값 중 골라 쓰므로 파일을 만든 것이 몰에 들어간 것은 아닙니다.
            브랜드 칸은 채우지 않습니다: 우리 브랜드 값은 상호(kiditem)라 상품의 브랜드가 아닙니다.
          </p>
          <p className="mt-1 text-xs font-medium text-amber-700">
            윙에 올릴 때 [엑셀 대량 수정] › Step 2 창의 <strong>항목을 &apos;쿠팡상품정보&apos;로 바꾸세요</strong>. 기본값은
            &apos;가격/재고/판매상태&apos;라 그대로 올리면 접수되지 않습니다.
          </p>
          <a
            href={WING_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-medium text-sky-600 hover:underline"
          >
            윙 상품조회/수정 열기
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-secondary gap-1.5"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {check.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            엑셀 올리기
          </button>
          <button
            type="button"
            className="btn-primary gap-1.5"
            disabled={busy || !plan || plan.changedCells === 0}
            onClick={() => download.mutate()}
          >
            {download.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            채운 파일 받기
          </button>
        </div>
      </div>

      {file ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <FileSpreadsheet size={13} />
          {file.name}
        </p>
      ) : null}

      {plan ? <PlanSummary plan={plan} /> : null}
    </section>
  );
}

function PlanSummary({ plan }: { plan: CoupangCatalogPlanResult }) {
  const columns = Object.entries(plan.byColumn).sort(([, left], [, right]) => right - left);
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Stat label="옵션 줄" value={plan.rows} />
        <Stat label="우리 단품과 이어진 줄" value={plan.linked} />
        <Stat label="채우는 칸" value={plan.changedCells} />
        <Stat label="다르지만 둔 칸" value={plan.conflicts} />
      </dl>
      {columns.length > 0 ? (
        <p className="text-xs text-slate-600">
          {columns.map(([column, count]) => `${column} ${formatNumber(count)}`).join(' · ')}
        </p>
      ) : (
        <p className="text-xs text-slate-500">채울 빈 칸이 없습니다. 파일을 만들지 않아도 됩니다.</p>
      )}
      {plan.conflicts > 0 ? (
        <p className="text-xs text-amber-700">
          우리 값과 다르지만 몰에 이미 값이 있는 칸은 두었습니다. 바꿔야 하면 말씀해 주세요.
        </p>
      ) : null}
      {plan.samples.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-600">
          {plan.samples.slice(0, 5).map((row) => (
            <li key={row.optionId} className="truncate">
              <span className="tabular-nums text-slate-400">{row.optionId}</span>{' '}
              {row.listingName}
              {row.changes.length > 0
                ? ` — ${row.changes.map((change) => `${change.column} ${change.after}`).join(' · ')}`
                : ` — 다름: ${row.conflicts.map((change) => `${change.column} ${change.before}→${change.after}`).join(' · ')}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-800">{formatNumber(value)}</dd>
    </div>
  );
}
