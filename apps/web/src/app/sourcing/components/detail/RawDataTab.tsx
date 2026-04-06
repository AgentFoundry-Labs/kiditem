'use client';

import { Database, ImageIcon, Package, Tag } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface RawDataTabProps {
  rawData: Record<string, unknown> | null;
}

export default function RawDataTab({ rawData }: RawDataTabProps) {
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  if (!rawData) {
    return (
      <div className="p-6">
        <div className="card p-8">
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Database size={40} className="mb-3 text-slate-300" />
            <p className="text-sm font-medium">원본 데이터 없음</p>
            <p className="text-xs text-slate-400 mt-1">스크래핑된 원본 데이터가 없습니다</p>
          </div>
        </div>
      </div>
    );
  }

  const images = Array.isArray(rawData.images) ? (rawData.images as string[]) : [];
  const descriptionImages = Array.isArray(rawData.description_images) ? (rawData.description_images as string[]) : [];
  const title = typeof rawData.title === 'string' ? rawData.title : null;
  const price = rawData.price as { min?: number; max?: number; unit?: string } | null;
  const specs = Array.isArray(rawData.specs) ? (rawData.specs as Array<{ key: string; value: string }>) : [];
  const moq = rawData.moq as number | null | undefined;
  const unit = typeof rawData.unit === 'string' ? rawData.unit : null;
  const category = typeof rawData.category_name === 'string' ? rawData.category_name : typeof rawData.category === 'string' ? rawData.category : null;

  return (
    <div className="space-y-6 p-6">
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center cursor-pointer backdrop-blur-sm"
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

      <div className="card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-emerald-500" />
          <h2 className="text-base font-bold text-slate-900">원본 기본 정보</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">원본 상품명</p>
              <p className="text-sm font-medium text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-100">
                {title || '없음'}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">카테고리</p>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <Tag size={14} className="text-slate-400" />
                  <span className="truncate">{category || '없음'}</span>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">최소 주문 / 단위</p>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <Package size={14} className="text-slate-400" />
                  <span>
                    {moq ? `${moq}개` : '없음'} {unit ? `/ ${unit}` : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">원본 가격 (단위: {price?.unit || 'CNY'})</p>
            <div className="bg-emerald-50 text-emerald-900 p-4 rounded-lg border border-emerald-100 flex items-center justify-center h-[106px]">
              {price ? (
                <div className="text-center">
                  {price.min && price.max && price.min !== price.max ? (
                    <span className="text-2xl font-bold">
                      {price.min.toLocaleString()} ~ {price.max.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-2xl font-bold">
                      {(price.min || price.max || 0).toLocaleString()}
                    </span>
                  )}
                  <span className="text-sm font-medium ml-1 text-emerald-700">{price.unit || 'CNY'}</span>
                </div>
              ) : (
                <span className="text-sm text-emerald-700 font-medium">가격 정보 없음</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon size={18} className="text-blue-500" />
          <h2 className="text-base font-bold text-slate-900">원본 썸네일 ({images.length}장)</h2>
        </div>
        
        {images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {images.map((url, idx) => (
              <div
                key={`raw-img-${idx}`}
                className="aspect-square rounded-lg border border-slate-200 overflow-hidden cursor-pointer hover:border-blue-500 hover:ring-2 hover:ring-blue-200 transition-all bg-slate-50 group relative"
                onClick={() => setEnlargedImage(url)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Raw image ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <ImageIcon size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-lg border border-slate-100">
            이미지가 없습니다.
          </p>
        )}
      </div>

      <div className="space-y-6">
        <div className="card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon size={18} className="text-purple-500" />
            <h2 className="text-base font-bold text-slate-900">상세 설명 이미지 ({descriptionImages.length}장)</h2>
          </div>
          
          {descriptionImages.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {descriptionImages.map((url, idx) => (
                <div
                  key={`desc-img-${idx}`}
                  className="aspect-[3/4] rounded-lg border border-slate-200 overflow-hidden cursor-pointer hover:border-purple-500 transition-colors bg-slate-50"
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
            <p className="text-sm text-slate-500 py-8 text-center border border-slate-100 bg-slate-50 rounded-lg">
              상세 설명 이미지가 없습니다.
            </p>
          )}
        </div>

        <div className="card p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-4">상세 스펙 ({specs.length}개)</h2>
          
          {specs.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="text-left">
                <tbody className="divide-y divide-slate-200">
                  {specs.map((spec, idx) => (
                    <tr key={`spec-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <th className="px-4 py-3 font-medium text-slate-700 w-1/3 border-r border-slate-200">
                        {spec.key}
                      </th>
                      <td className="px-4 py-3 text-slate-600">
                        {spec.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-8 text-center border border-slate-100 bg-slate-50 rounded-lg">
              상세 스펙 정보가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
