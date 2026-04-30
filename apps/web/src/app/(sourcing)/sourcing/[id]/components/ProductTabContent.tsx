'use client';

import Link from 'next/link';
import { ChevronDown, Download, Pencil, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import ThumbnailGrid from './ThumbnailGrid';
import TagEditor from './TagEditor';
import RawDataTab from './RawDataTab';
import { CATEGORIES } from '../lib/types';
import type { EditTabType } from './ProductEditTabs';
import type { ProductEditState } from '../lib/types';

interface Props {
  activeTab: EditTabType;
  editData: ProductEditState;
  updateField: <K extends keyof ProductEditState>(field: K, value: ProductEditState[K]) => void;
  nameLength: number;
  productId: string;
  detailPreviewHtml: string;
  rawData: Record<string, unknown> | null;
}

export default function ProductTabContent({
  activeTab,
  editData,
  updateField,
  nameLength,
  productId,
  detailPreviewHtml,
  rawData,
}: Props) {
  switch (activeTab) {
    case 'basic':
      return (
        <div className="space-y-6 p-6">
          <div className="card p-5">
            <ThumbnailGrid
              thumbnails={editData.thumbnails}
              onThumbnailsChange={(v) => updateField('thumbnails', v)}
            />
          </div>

          <div className="card p-5">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-700">카테고리</label>
              <div className="relative">
                <select
                  value={editData.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className="w-full appearance-none px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors cursor-pointer"
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
                <label className="text-sm font-semibold text-slate-700">상품명</label>
                <span className={cn('text-xs font-medium', nameLength > 100 ? 'text-red-500' : 'text-slate-400')}>
                  {nameLength}/100자
                </span>
              </div>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-colors"
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
                  <label className="text-sm font-semibold text-slate-700">상품정보제공공시</label>
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
        <div className="p-6">
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
      return (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">생성된 상세페이지</h3>
            <div className="flex items-center gap-2">
              <Link
                href={`/sourcing/${productId}/editor`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Pencil size={12} />
                에디터에서 편집
              </Link>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors">
                <Download size={12} />
                이미지 다운로드
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: '80vh' }}>
            <iframe
              srcDoc={detailPreviewHtml}
              className="w-full h-full border-0"
              title="detail-page-preview"
            />
          </div>
        </div>
      );

    case 'raw':
      return <RawDataTab rawData={rawData} />;

    default:
      return null;
  }
}
