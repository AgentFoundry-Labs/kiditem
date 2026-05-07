import { Sparkles } from 'lucide-react';

export default function GeneratePageHeader() {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
      <div className="flex w-full items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-soft)]">
              <Sparkles className="text-[var(--primary)]" size={18} />
            </div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              AI 상세페이지 생성
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            상품 이미지와 핵심 정보를 넣으면 선택한 템플릿에 맞춰 상세페이지 문구와 구성을 만듭니다.
          </p>
        </div>
      </div>
    </div>
  );
}
