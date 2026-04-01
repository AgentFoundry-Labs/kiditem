'use client';
import { Sparkles } from 'lucide-react';

export default function GeneratePageHeader() {
  return (
    <div className="bg-white border-b border-gray-200 px-8 py-10">
      <div className="max-w-4xl mx-auto flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="text-blue-600" size={24} />
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
              AI 상세페이지 생성
            </h1>
          </div>
          <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">
            상품 URL이나 이미지를 등록하시면, AI가 외국어를 완벽히 번역하고
            타겟 고객에 맞춘 프리미엄 마케팅 문구를 자동으로 작성합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
