'use client';

import { ChevronDown, Settings } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import ThumbnailGrid from '../../components/detail/ThumbnailGrid';
import TagEditor from '../../components/detail/TagEditor';
import RawDataTab from '../../components/detail/RawDataTab';
import { CATEGORIES } from '../lib/types';
import type { EditTabType } from '../../components/detail/ProductEditTabs';
import type { ProductEditState } from '../lib/types';
import { LinkedProducedContentPanel } from './LinkedProducedContentPanel';

interface Props {
  activeTab: EditTabType;
  editData: ProductEditState;
  updateField: <K extends keyof ProductEditState>(field: K, value: ProductEditState[K]) => void;
  nameLength: number;
  productId: string;
  rawData: Record<string, unknown> | null;
  imageUrls: string[];
  thumbnailUrl: string | null;
  /** 승격 완료된 후보의 master id. null 이면 미승격 상태. */
  promotedMasterId: string | null;
}

export default function ProductTabContent({
  activeTab,
  editData,
  updateField,
  nameLength,
  productId,
  rawData,
  imageUrls,
  thumbnailUrl,
  promotedMasterId,
}: Props) {
  switch (activeTab) {
    case 'basic':
      return (
        <div className="space-y-4 p-5">
          <div className="card p-5">
            <ThumbnailGrid
              thumbnails={editData.thumbnails}
              onThumbnailsChange={(v) => updateField('thumbnails', v)}
            />
          </div>

          <div className="card p-5">
            <div className="space-y-3">
              <label className="text-base font-semibold text-slate-800">카테고리</label>
              <div className="relative">
                <select
                  value={editData.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className="w-full appearance-none px-4 py-3 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors cursor-pointer"
                >
                  <option value="">카테고리 선택</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold text-slate-800">상품명</label>
                <span className={cn('text-sm font-medium', nameLength > 100 ? 'text-red-500' : 'text-slate-400')}>
                  {nameLength}/100자
                </span>
              </div>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
                placeholder="상품명을 입력하세요"
                maxLength={100}
              />
            </div>
          </div>

          <div className="card p-5">
            <TagEditor
              tags={editData.tags}
              onTagsChange={(v) => updateField('tags', v)}
            />
          </div>

          {editData.productInfo.length > 0 && (
            <div className="card p-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-base font-semibold text-slate-800">상품정보제공공시</label>
                  <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                    편집
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editData.productInfo.map((item) => (
                    <div
                      key={item.key}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm hover:border-slate-300 transition-colors"
                    >
                      <span className="text-slate-500 font-medium">{item.key}:</span>
                      <span className="text-slate-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );

    case 'options':
      return (
        <div className="p-5">
          <div className="card p-8">
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Settings size={40} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium">옵션 및 판매가 설정</p>
              <p className="text-xs text-slate-400 mt-1">준비 중인 기능입니다</p>
            </div>
          </div>
        </div>
      );

    case 'detail':
    case 'history':
      return (
        <div className="p-5">
          <div className="card space-y-4 p-8 text-center text-sm text-slate-500">
            <LinkedProducedContentPanel
              candidateId={productId}
              promotedMasterId={promotedMasterId}
            />
            {promotedMasterId ? (
              <>
                <p className="font-medium text-slate-700">상세페이지/이력 편집은 마스터 페이지에서 진행하세요</p>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <Link
                    href={`/product-content/${promotedMasterId}`}
                    className="text-emerald-600 hover:text-emerald-700 underline"
                  >
                    상세페이지 콘텐츠 관리 →
                  </Link>
                  <Link
                    href={`/generate?productId=${promotedMasterId}&sourceCandidateId=${productId}`}
                    className="text-emerald-600 hover:text-emerald-700 underline"
                  >
                    새 상세페이지 생성 →
                  </Link>
                  <Link
                    href={`/thumbnail-editor/edit?productId=${promotedMasterId}&mode=edit&editCase=single`}
                    className="text-emerald-600 hover:text-emerald-700 underline"
                  >
                    썸네일 편집 →
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p>상품 연결 없이도 AI 콘텐츠를 먼저 생성할 수 있습니다.</p>
                <Link
                  href={`/generate?sourceCandidateId=${productId}`}
                  className="inline-flex text-emerald-600 hover:text-emerald-700 underline"
                >
                  미연결 상세페이지 생성 →
                </Link>
              </>
            )}
          </div>
        </div>
      );

    case 'raw':
      return (
        <RawDataTab
          productId={productId}
          rawData={rawData}
          imageUrls={imageUrls}
          thumbnailUrl={thumbnailUrl}
        />
      );

    default:
      return null;
  }
}
