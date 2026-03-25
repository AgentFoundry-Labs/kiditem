'use client';

import { ImagePickerModal } from '@/components/editor/ImagePickerModal';
import { type DetailPageData } from '@kiditem/templates';
import { ImagePlus, Palette, Type } from 'lucide-react';
import { useState } from 'react';
import { ColorPickerField } from './ColorPickerField';

interface StructuredEditPanelProps {
  data: DetailPageData;
  rawImages: string[];
  onChange: (updated: DetailPageData) => void;
  onSave: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500';

export function StructuredEditPanel({ data, rawImages, onChange, onSave }: StructuredEditPanelProps) {
  const [heroPickerOpen, setHeroPickerOpen] = useState(false);

  function handleText<K extends keyof DetailPageData>(field: K, value: DetailPageData[K]) {
    onChange({ ...data, [field]: value });
  }

  function handleBlur() {
    onSave();
  }

  return (
    <div className="overflow-y-auto h-full bg-white">
      {/* Section 1: 기본 텍스트 */}
      <div className="border-b border-gray-100 py-4 px-4">
        <div className="flex items-center gap-2 mb-3">
          <Type size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-700">텍스트 편집</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">제목 *</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={data.title}
              onChange={(e) => handleText('title', e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">부제목</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={data.subtitle}
              onChange={(e) => handleText('subtitle', e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">뱃지</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={data.badge}
              onChange={(e) => handleText('badge', e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">훅 텍스트</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={data.hookText}
              onChange={(e) => handleText('hookText', e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">훅 서브타이틀</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={data.hookTitleSub}
              onChange={(e) => handleText('hookTitleSub', e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">훅 설명</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={data.hookSubtext}
              onChange={(e) => handleText('hookSubtext', e.target.value)}
              onBlur={handleBlur}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">상품 설명 (줄바꿈으로 구분)</label>
            <textarea
              className={`${INPUT_CLASS} resize-none`}
              rows={4}
              value={data.description.join('\n')}
              onChange={(e) => handleText('description', e.target.value.split('\n'))}
              onBlur={handleBlur}
            />
          </div>
        </div>
      </div>

      {/* Key Points */}
      {data.keyPoints.length > 0 && (
        <div className="border-b border-gray-100 py-4 px-4">
          <span className="text-xs font-semibold text-gray-700 block mb-3">키포인트</span>
          <div className="space-y-4">
            {data.keyPoints.map((kp, idx) => (
              <div key={idx} className="space-y-2">
                <span className="text-xs text-gray-400 font-mono">#{idx + 1}</span>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">제목</label>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={kp.title}
                    onChange={(e) => {
                      const updated = [...data.keyPoints];
                      updated[idx] = { ...kp, title: e.target.value };
                      handleText('keyPoints', updated);
                    }}
                    onBlur={handleBlur}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">설명</label>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    value={kp.description}
                    onChange={(e) => {
                      const updated = [...data.keyPoints];
                      updated[idx] = { ...kp, description: e.target.value };
                      handleText('keyPoints', updated);
                    }}
                    onBlur={handleBlur}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Specs */}
      {data.specs.length > 0 && (
        <div className="border-b border-gray-100 py-4 px-4">
          <span className="text-xs font-semibold text-gray-700 block mb-3">스펙</span>
          <div className="space-y-2">
            {data.specs.map((spec, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="항목"
                  value={spec.key}
                  onChange={(e) => {
                    const updated = [...data.specs];
                    updated[idx] = { ...spec, key: e.target.value };
                    handleText('specs', updated);
                  }}
                  onBlur={handleBlur}
                />
                <input
                  type="text"
                  className={INPUT_CLASS}
                  placeholder="값"
                  value={spec.value}
                  onChange={(e) => {
                    const updated = [...data.specs];
                    updated[idx] = { ...spec, value: e.target.value };
                    handleText('specs', updated);
                  }}
                  onBlur={handleBlur}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: 테마 컬러 */}
      <div className="border-b border-gray-100 py-4 px-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-700">테마 컬러</span>
        </div>
        <div className="space-y-2">
          <ColorPickerField
            label="메인 컬러"
            value={data.themeColorMain}
            onChange={(hex) => onChange({ ...data, themeColorMain: hex })}
            onClose={onSave}
          />
          <ColorPickerField
            label="배경 밝은"
            value={data.themeColorBgLight}
            onChange={(hex) => onChange({ ...data, themeColorBgLight: hex })}
            onClose={onSave}
          />
          <ColorPickerField
            label="뱃지 1"
            value={data.themeColorBadge1}
            onChange={(hex) => onChange({ ...data, themeColorBadge1: hex })}
            onClose={onSave}
          />
          <ColorPickerField
            label="뱃지 2"
            value={data.themeColorBadge2}
            onChange={(hex) => onChange({ ...data, themeColorBadge2: hex })}
            onClose={onSave}
          />
          <ColorPickerField
            label="섹션 배경"
            value={data.themeSectionBg}
            onChange={(hex) => onChange({ ...data, themeSectionBg: hex })}
            onClose={onSave}
          />
          <ColorPickerField
            label="본문 텍스트"
            value={data.themeTextPrimary}
            onChange={(hex) => onChange({ ...data, themeTextPrimary: hex })}
            onClose={onSave}
          />
          <ColorPickerField
            label="보조 텍스트"
            value={data.themeTextSecondary}
            onChange={(hex) => onChange({ ...data, themeTextSecondary: hex })}
            onClose={onSave}
          />
        </div>
      </div>

      {/* Section 3: 히어로 이미지 */}
      <div className="py-4 px-4">
        <div className="flex items-center gap-2 mb-3">
          <ImagePlus size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-700">히어로 이미지</span>
        </div>
        {data.heroBanner ? (
          <img
            src={data.heroBanner}
            alt="히어로 이미지"
            className="w-full h-24 object-cover rounded-lg border border-gray-200 mb-2"
          />
        ) : (
          <div className="w-full h-24 bg-gray-50 rounded-lg border border-dashed border-gray-300 flex items-center justify-center mb-2">
            <span className="text-xs text-gray-400">선택된 이미지 없음</span>
          </div>
        )}
        <button
          type="button"
          className="w-full py-2 px-3 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          onClick={() => setHeroPickerOpen(true)}
        >
          <ImagePlus size={14} />
          이미지 선택
        </button>
      </div>

      <ImagePickerModal
        open={heroPickerOpen}
        rawImages={rawImages}
        processedImages={[]}
        onSelect={(url) => {
          onChange({ ...data, heroBanner: url });
          setHeroPickerOpen(false);
          onSave();
        }}
        onClose={() => setHeroPickerOpen(false)}
      />
    </div>
  );
}
