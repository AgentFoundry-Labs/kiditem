'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, ImageIcon, Package, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';
import { productsApi } from '../../lib/sourcing-api';
import { projectRawData } from '../../lib/raw-data-projection';

interface RawDataTabProps {
  productId: string;
  rawData: Record<string, unknown> | null;
  imageUrls: string[];
  thumbnailUrl: string | null;
}

export default function RawDataTab({ productId, rawData, imageUrls, thumbnailUrl }: RawDataTabProps) {
  const queryClient = useQueryClient();
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState('');
  const [rawValue, setRawValue] = useState('');
  const [addedRows, setAddedRows] = useState<Array<{ key: string; value: string }>>([]);

  const addRawData = useMutation({
    mutationFn: () => productsApi.addRawDataField(productId, { key: rawKey.trim(), value: rawValue.trim() }),
    onSuccess: () => {
      setAddedRows((prev) => [{ key: rawKey.trim(), value: rawValue.trim() }, ...prev]);
      setRawKey('');
      setRawValue('');
      queryClient.invalidateQueries({ queryKey: queryKeys.sourcing.detail(productId) });
      toast.success('원본 데이터를 추가했습니다.');
    },
    onError: () => toast.error('원본 데이터 추가에 실패했습니다.'),
  });

  const projection = projectRawData({ rawData, imageUrls, thumbnailUrl });
  const {
    productImages,
    descriptionImages,
    selectedThumbnail,
    title,
    price,
    specs,
    moq,
    unit,
    category,
    fieldGroups,
  } = projection;
  const canAddRawData = rawKey.trim().length > 0 && rawValue.trim().length > 0 && !addRawData.isPending;

  return (
    <div className="space-y-4 p-5">
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center cursor-pointer"
          onClick={() => setEnlargedImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedImage}
            alt="Enlarged view"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database size={14} className="text-emerald-500" />
          <h2 className="text-sm font-semibold text-slate-900">원본 기본 정보</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] text-slate-500 font-medium mb-1">원본 상품명</p>
              <p className="text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                {title || '없음'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-500 font-medium mb-1">카테고리</p>
                <div className="flex items-center gap-1.5 text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                  <Tag size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate">{category || '없음'}</span>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-slate-500 font-medium mb-1">최소 주문 / 단위</p>
                <div className="flex items-center gap-1.5 text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                  <Package size={12} className="text-slate-400 shrink-0" />
                  <span>
                    {moq ? `${moq}개` : '없음'} {unit ? `/ ${unit}` : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 font-medium mb-1">
              원본 가격{price?.unit ? ` (단위: ${price.unit})` : ''}
            </p>
            <div className="bg-emerald-50 text-emerald-900 px-4 py-3 rounded-md border border-emerald-100 flex items-center justify-center h-[88px]">
              {price ? (
                <div className="text-center">
                  {price.min && price.max && price.min !== price.max ? (
                    <span className="text-xl font-bold tabular-nums">
                      {formatNumber(price.min)} ~ {formatNumber(price.max)}
                    </span>
                  ) : (
                    <span className="text-xl font-bold tabular-nums">
                      {formatNumber(price.min || price.max || 0)}
                    </span>
                  )}
                  <span className="text-xs font-medium ml-1 text-emerald-700">{price.unit}</span>
                </div>
              ) : (
                <span className="text-xs text-emerald-700 font-medium">가격 정보 없음</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-sky-500" />
            <h2 className="text-sm font-semibold text-slate-900">원본 데이터 추가</h2>
          </div>
          {!rawData && <span className="text-[11px] font-medium text-slate-400">저장 후 원본 데이터로 표시됩니다</span>}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_1fr_auto]">
          <input
            value={rawKey}
            onChange={(event) => setRawKey(event.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
            placeholder="항목명 예: 재질"
            maxLength={80}
          />
          <input
            value={rawValue}
            onChange={(event) => setRawValue(event.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
            placeholder="값 예: ABS 플라스틱"
            maxLength={10000}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canAddRawData) addRawData.mutate();
            }}
          />
          <button
            type="button"
            disabled={!canAddRawData}
            onClick={() => addRawData.mutate()}
            className="h-9 rounded-md bg-slate-900 px-4 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {addRawData.isPending ? '추가 중' : '추가'}
          </button>
        </div>

        {addedRows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {addedRows.map((row, index) => (
              <span
                key={`${row.key}-${index}`}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800"
              >
                {row.key}: {row.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {fieldGroups.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {fieldGroups.map((group) => (
            <div key={group.title} className="card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Database size={14} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900">
                  {group.title} <span className="font-medium text-slate-400">({group.rows.length}개)</span>
                </h2>
              </div>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full table-fixed text-left text-xs">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[66%]" />
                  </colgroup>
                  <tbody className="divide-y divide-slate-200">
                    {group.rows.map((row, index) => (
                      <tr key={`${group.title}-${row.key}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <th className="border-r border-slate-200 px-3 py-2 align-top font-medium leading-relaxed text-slate-700 break-words">
                          {row.key}
                        </th>
                        <td className="whitespace-pre-wrap px-3 py-2 align-top leading-relaxed text-slate-600 break-words">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon size={14} className="text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-900">원본 썸네일</h2>
          {selectedThumbnail && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">
              자동 선택
            </span>
          )}
        </div>

        {selectedThumbnail ? (
          <div
            className="group relative max-w-[220px] cursor-pointer overflow-hidden rounded-xl border border-blue-100 bg-slate-50 shadow-sm transition-all hover:border-blue-300 hover:ring-2 hover:ring-blue-200/60"
            onClick={() => setEnlargedImage(selectedThumbnail)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedThumbnail}
              alt="Selected raw thumbnail"
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
              썸네일로 자동 선택됨
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-3 text-center bg-slate-50 rounded-md border border-slate-100">
            선택할 썸네일 이미지가 없습니다.
          </p>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon size={14} className="text-emerald-500" />
          <h2 className="text-sm font-semibold text-slate-900">상품 이미지 <span className="text-slate-400 font-medium">({productImages.length}장)</span></h2>
        </div>

        {productImages.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
            {productImages.map((url, idx) => (
              <div
                key={`product-img-${idx}`}
                className="aspect-square rounded-md border border-slate-200 overflow-hidden cursor-pointer hover:border-emerald-400 hover:ring-2 hover:ring-emerald-200/60 transition-all bg-slate-50 group relative"
                onClick={() => setEnlargedImage(url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Product image ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {url === selectedThumbnail && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    썸네일
                  </span>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <ImageIcon size={16} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-3 text-center bg-slate-50 rounded-md border border-slate-100">
            이미지가 없습니다.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon size={14} className="text-purple-500" />
            <h2 className="text-sm font-semibold text-slate-900">상세 설명 이미지 <span className="text-slate-400 font-medium">({descriptionImages.length}장)</span></h2>
          </div>

          {descriptionImages.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {descriptionImages.map((url, idx) => (
                <div
                  key={`desc-img-${idx}`}
                  className="aspect-[3/4] rounded-md border border-slate-200 overflow-hidden cursor-pointer hover:border-emerald-400 transition-colors bg-slate-50"
                  onClick={() => setEnlargedImage(url)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Description image ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center border border-slate-100 bg-slate-50 rounded-md">
              상세 설명 이미지가 없습니다.
            </p>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">상세 스펙 <span className="text-slate-400 font-medium">({specs.length}개)</span></h2>

          {specs.length > 0 ? (
            <div className="border border-slate-200 rounded-md overflow-hidden">
              {/* 열 깨짐 방지 — table-fixed + colgroup 으로 key 32% / value 68% 강제 고정.
                  값이 길면 줄 바꿈 + break-words 로 다음 줄 전개. align-top 로 key 줄과
                  value 줄 머리 맞춤. 짧은 key + 긴 value 케이스에서도 정렬 깨지지 않음. */}
              <table className="w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[68%]" />
                </colgroup>
                <tbody className="divide-y divide-slate-200">
                  {specs.map((spec, idx) => (
                    <tr key={`spec-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <th className="px-3 py-2 align-top font-medium text-slate-700 border-r border-slate-200 break-words leading-relaxed">
                        {spec.key}
                      </th>
                      <td className="px-3 py-2 align-top text-slate-600 break-words leading-relaxed">
                        {spec.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center border border-slate-100 bg-slate-50 rounded-md">
              상세 스펙 정보가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
