'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Layout } from 'lucide-react';

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/sourcing/${productId}`)}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-sm font-bold text-gray-900">
            상세페이지 에디터
          </h1>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-2xl flex items-center justify-center">
            <Layout size={32} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            에디터 준비 중
          </h2>
          <p className="text-gray-500 text-sm max-w-md">
            GrapesJS 기반의 드래그 앤 드롭 에디터가 이 페이지에 통합될 예정입니다.
            <br />
            현재는 상품 상세 페이지에서 기본 편집이 가능합니다.
          </p>
          <button
            onClick={() => router.push(`/sourcing/${productId}`)}
            className="mt-6 px-5 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors"
          >
            상품 상세로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
