'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  CoupangWingCatalogImportResponseSchema,
  type CoupangWingCatalogImportResponse,
} from '@kiditem/shared/source-import';
import { apiClient } from '@/lib/api-client';
import { salesProductApi, salesProductKeys } from '@/lib/sales-product-api';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { friendlyError } from '@/lib/api-error';

const WING_DOWNLOAD_URL = 'https://wing.coupang.com/vendor-inventory/list';
const COUPANG_MALL_KEY = 'coupang';

/**
 * 쿠팡 윙 등록 상품을 **엑셀로 가져온다**. 확장이 윙 화면을 읽는 '상품 받기'와 같은 owner
 * 경로(`catalog-imports/coupang-wing`)로 들어가고, 둘 다 쓴다(사장님 2026-09-22
 * "둘다 기능을 유지해줘"). 확장은 가격 · 재고까지 읽고, 엑셀은 한 번에 전부 들어온다.
 *
 * 파일은 윙 › 상품 조회/수정 › [엑셀 대량 수정] › Step 1 에서 요청해 받은 것이다. 윙이 그 파일의
 * 시트 범위를 머리 네 줄로 적어 놓아도 서버가 실제 칸으로 다시 세므로 줄을 잃지 않는다.
 */
export function CoupangWingExcelImport() {
  const accountQuery = useQuery({
    queryKey: salesProductKeys.mallAccounts(),
    queryFn: () => salesProductApi.mallAccounts(),
  });
  // 목록을 못 읽었으면 계정을 모르는 것이지 없는 것이 아니다 — 모양이 어긋나도 화면이 죽지 않는다.
  const channelAccountId = (Array.isArray(accountQuery.data) ? accountQuery.data : [])
    .find((account) => account.mallKey === COUPANG_MALL_KEY)?.channelAccountId ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<CoupangWingCatalogImportResponse | null>(null);
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!channelAccountId) throw new Error('쿠팡 몰 계정이 없습니다.');
      const form = new FormData();
      form.append('file', file);
      return apiClient.uploadParsed(
        `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-wing`,
        CoupangWingCatalogImportResponseSchema,
        form,
      );
    },
    onSuccess: async (response) => {
      setResult(response);
      if (response.duplicate) {
        toast.info('같은 파일을 이미 가져왔습니다. 다시 쓰지 않았습니다.');
      } else {
        toast.success(
          `상품 ${formatNumber(response.changes.createdProductCount + response.changes.updatedProductCount)}개 · `
          + `옵션 ${formatNumber(response.changes.createdSkuCount + response.changes.updatedSkuCount)}개 반영했습니다.`,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.channelListings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mallPublishing.all }),
      ]);
    },
    onError: (error: Error) => {
      setResult(null);
      toast.error(friendlyError(error, '엑셀을 가져오지 못했습니다.'));
    },
  });

  function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    upload.mutate(file);
  }

  return (
    <section
      aria-label="쿠팡 윙 엑셀로 상품 가져오기"
      className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">쿠팡 윙 엑셀로 상품 가져오기</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            윙에서 내려받은 쿠팡상품정보 엑셀을 올리면 등록 상품과 옵션을 한 번에 가져옵니다. 확장이 윙 화면을 읽는
            [상품 받기]와 같은 자리에 들어가며, 가격 · 재고 · 사진은 이 엑셀에 없어 [상품 받기]가 채웁니다.
          </p>
          <a
            href={WING_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-medium text-sky-600 hover:underline"
          >
            윙 상품 조회/수정 열기
          </a>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-primary gap-1.5"
            disabled={upload.isPending || !channelAccountId}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            엑셀 올리기
          </button>
        </div>
      </div>

      {fileName ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <FileSpreadsheet size={13} />
          {fileName}
        </p>
      ) : null}

      {!channelAccountId ? (
        <p className="text-xs text-amber-700">쿠팡 몰 계정이 없어 가져올 수 없습니다.</p>
      ) : null}

      {result ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-xs sm:grid-cols-5">
          <Stat label="새 상품" value={result.changes.createdProductCount} />
          <Stat label="고친 상품" value={result.changes.updatedProductCount} />
          <Stat label="새 옵션" value={result.changes.createdSkuCount} />
          <Stat label="고친 옵션" value={result.changes.updatedSkuCount} />
          <Stat label="건너뛴 줄" value={result.changes.skippedRowCount} />
        </dl>
      ) : null}
    </section>
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
